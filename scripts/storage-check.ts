/**
 * Prueba del almacenamiento contra un S3 falso local (no toca R2 real):
 *  - detecta el tipo real de la imagen por sus bytes;
 *  - sube y borra con firma SigV4;
 *  - no borra URLs que no son del bucket (p. ej. la foto de Google).
 *   bun scripts/storage-check.ts
 */
import { createServer } from 'node:http';

const calls: { method: string; path: string; auth: string; type: string; length: string }[] = [];
const server = createServer((req, res) => {
  calls.push({
    method: req.method ?? '',
    path: new URL(req.url ?? '/', 'http://x').pathname,
    auth: String(req.headers.authorization ?? ''),
    type: String(req.headers['content-type'] ?? ''),
    length: String(req.headers['content-length'] ?? ''),
  });
  req.resume();
  req.on('end', () => {
    res.statusCode = req.method === 'PUT' ? 200 : 204;
    res.end();
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
process.env.R2_ACCOUNT_ID = 'acct';
process.env.R2_ACCESS_KEY_ID = 'AKIATEST';
process.env.R2_SECRET_ACCESS_KEY = 'secret';
process.env.R2_BUCKET = 'bucket';
process.env.R2_PUBLIC_URL = 'https://cdn.example.com/';
process.env.R2_ENDPOINT = `http://localhost:${port}`;

const { deleteByUrl, putObject, sniffImage, storageEnabled } = await import('../src/server/lib/storage');

const out: [string, boolean, string?][] = [];
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 0]);
out.push([
  'Detecta JPEG, PNG y WebP',
  sniffImage(jpg) === 'image/jpeg' && sniffImage(png) === 'image/png' && sniffImage(webp) === 'image/webp',
]);
out.push([
  'Rechaza texto y HTML disfrazados de imagen',
  sniffImage(new TextEncoder().encode('<html><script>alert(1)</script>')) === null &&
    sniffImage(new TextEncoder().encode('GIF89a......')) === null,
]);
out.push(['Almacenamiento activo con las variables', storageEnabled()]);

const url = await putObject('orgs/o1/cover-abc.jpg', jpg, 'image/jpeg');
out.push(['La URL pública usa R2_PUBLIC_URL sin «//» doble', url === 'https://cdn.example.com/orgs/o1/cover-abc.jpg', url]);
const put = calls.find((c) => c.method === 'PUT');
out.push([
  'PUT firmado (SigV4) a /bucket/clave',
  !!put && put.path === '/bucket/orgs/o1/cover-abc.jpg' && put.auth.startsWith('AWS4-HMAC-SHA256') && put.type === 'image/jpeg',
  put?.auth.slice(0, 40),
]);

out.push(['PUT con Content-Length (R2 responde 411 si falta)', put?.length === String(jpg.byteLength), put?.length]);

await deleteByUrl(url);
out.push(['DELETE de un archivo propio', calls.some((c) => c.method === 'DELETE' && c.path === '/bucket/orgs/o1/cover-abc.jpg')]);
const before = calls.length;
await deleteByUrl('https://lh3.googleusercontent.com/a/foto');
await deleteByUrl(null);
out.push(['No borra URLs ajenas ni vacías', calls.length === before]);

delete process.env.R2_BUCKET;
out.push(['Sin variables queda desactivado', !storageEnabled()]);

for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
server.close();
if (out.some(([, ok]) => !ok)) process.exit(1);
console.log(`\n${out.length} comprobaciones pasaron.`);
