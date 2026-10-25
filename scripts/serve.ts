/**
 * Servidor de producción para hosting con Node/Bun (Railway, Render, Fly…): sirve la web exportada (`dist/client`) y las
 * rutas `/api` y páginas (`dist/server`) con el adaptador oficial de Expo. Antes: `bun run build:web`.
 *   bun scripts/serve.ts            (puerto de $PORT, o 8081)
 *
 * No hay límite de consultas por petición (el hosting de EAS permite solo 10), y es el mismo código que corre en desarrollo.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { createRequestHandler } from 'expo-server/adapter/bun';

declare const Bun: {
  serve: (o: { port: number; hostname?: string; fetch: (r: Request) => Response | Promise<Response> }) => { port: number };
  file: (p: string) => Blob;
};

const root = resolve(import.meta.dirname, '..', 'dist');
const clientDir = join(root, 'client');
const handler = createRequestHandler({ build: join(root, 'server') });

const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|txt|xml|map|ttf|otf)$/i;
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.map': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
type Encoding = 'br' | 'gzip';
/** Mejor compresión que acepta el navegador (brotli, si no gzip). */
const pickEncoding = (request: Request): Encoding | null => {
  const accept = request.headers.get('accept-encoding') ?? '';
  return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
};
const compress = (data: Uint8Array, enc: Encoding): Buffer =>
  enc === 'br'
    ? brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
    : gzipSync(data, { level: 9 });
/** Archivos ya comprimidos: se comprimen una sola vez (el JS pesa varios MB sin comprimir) y se sirven desde memoria. */
const cache = new Map<string, { mtime: number; body: Buffer }>();

/** Archivos estáticos de `dist/client` (los de `_expo/static` llevan hash en el nombre: se cachean un año). */
function staticResponse(pathname: string, request: Request): Response | null {
  const file = normalize(join(clientDir, decodeURIComponent(pathname)));
  if (file !== clientDir && !file.startsWith(clientDir + sep)) return null; // nada fuera de dist/client
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const hashed = pathname.startsWith('/_expo/static/');
  const headers: Record<string, string> = { 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600', vary: 'accept-encoding' };
  const enc = COMPRESSIBLE.test(file) ? pickEncoding(request) : null;
  if (!enc) return new Response(Bun.file(file), { headers });
  const key = `${enc}:${file}`;
  const mtime = statSync(file).mtimeMs;
  let hit = cache.get(key);
  if (!hit || hit.mtime !== mtime) {
    hit = { mtime, body: compress(readFileSync(file), enc) };
    cache.set(key, hit);
  }
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  if (TYPES[ext]) headers['content-type'] = TYPES[ext];
  headers['content-encoding'] = enc;
  return new Response(hit.body as unknown as BodyInit, { headers });
}

/** Las páginas (HTML renderizado en el servidor) también se envían comprimidas. */
async function maybeCompress(request: Request, response: Response): Promise<Response> {
  const enc = pickEncoding(request);
  const type = response.headers.get('content-type') ?? '';
  if (!enc || !type.startsWith('text/html') || response.headers.has('content-encoding') || response.status !== 200) return response;
  const body = compress(new Uint8Array(await response.arrayBuffer()), enc);
  const headers = new Headers(response.headers);
  headers.set('content-encoding', enc);
  headers.set('vary', 'accept-encoding');
  headers.delete('content-length');
  return new Response(body as unknown as BodyInit, { status: response.status, headers });
}

const port = Number(process.env.PORT ?? 8081);
const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith('/api/')) {
      const hit = staticResponse(pathname, request);
      if (hit) return hit;
    }
    return maybeCompress(request, await handler(request));
  },
});
console.log(`Kompass escuchando en el puerto ${server.port}`);
