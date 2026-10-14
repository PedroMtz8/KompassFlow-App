/**
 * Servidor de producción para hosting con Node/Bun (Railway, Render, Fly…): sirve la web exportada (`dist/client`) y las
 * rutas `/api` y páginas (`dist/server`) con el adaptador oficial de Expo. Antes: `bun run build:web`.
 *   bun scripts/serve.ts            (puerto de $PORT, o 8081)
 *
 * No hay límite de consultas por petición (el hosting de EAS permite solo 10), y es el mismo código que corre en desarrollo.
 */
import { existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { createRequestHandler } from 'expo-server/adapter/bun';

declare const Bun: {
  serve: (o: { port: number; hostname?: string; fetch: (r: Request) => Response | Promise<Response> }) => { port: number };
  file: (p: string) => Blob;
};

const root = resolve(import.meta.dirname, '..', 'dist');
const clientDir = join(root, 'client');
const handler = createRequestHandler({ build: join(root, 'server') });

/** Archivos estáticos de `dist/client` (los de `_expo/static` llevan hash en el nombre: se cachean un año). */
function staticResponse(pathname: string): Response | null {
  const file = normalize(join(clientDir, decodeURIComponent(pathname)));
  if (file !== clientDir && !file.startsWith(clientDir + sep)) return null; // nada fuera de dist/client
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const hashed = pathname.startsWith('/_expo/static/');
  return new Response(Bun.file(file), {
    headers: { 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' },
  });
}

const port = Number(process.env.PORT ?? 8081);
const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith('/api/')) {
      const hit = staticResponse(pathname);
      if (hit) return hit;
    }
    return handler(request);
  },
});
console.log(`KompassFlow escuchando en el puerto ${server.port}`);
