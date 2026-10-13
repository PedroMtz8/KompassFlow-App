/**
 * Prueba de los mensajes de validación: datos inválidos devuelven 422 con un mensaje corto en español, sin el esquema
 * esperado ni los valores enviados, y el log del servidor tampoco guarda lo que escribió la persona (p. ej. contraseñas).
 *   bun --env-file=.env scripts/validation-check.ts
 */
import { eq } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-val-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const logged: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => void logged.push(a.map(String).join(' '));

let userId = '';
try {
  const r = await api.handle(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email: `${tag}@example.com`, password: 'clave-segura-123', name: 'ZZ val' }),
    })
  );
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  userId = ((await r.json()) as { user: { id: string } }).user.id;
  const post = async (path: string, body: unknown) => {
    const x = await api.handle(new Request('http://localhost/api' + path, { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify(body) }));
    const text = await x.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* no JSON */
    }
    return { status: x.status, text, message: String(json.message ?? '') };
  };
  const secret = 'S3creta-que-no-debe-salir-en-logs';

  const cases: [string, Awaited<ReturnType<typeof post>>, RegExp][] = [
    ['Falta un campo obligatorio', await post('/orgs', { name: 'Academia' }), /^Falta /],
    ['Nombre demasiado corto', await post('/orgs/abc/students', { name: 'A' }), /demasiado corto/],
    ['Nombre demasiado largo', await post('/orgs/abc/students', { name: 'A'.repeat(400) }), /demasiado largo/],
    ['Correo inválido', await post('/orgs/abc/students', { name: 'Ana Prueba', email: 'no-es-correo' }), /correo/i],
    ['Tipo de dato incorrecto', await post('/me/password', { newPassword: 12345 }), /Revisa la nueva contraseña/],
    [
      'Número fuera de rango',
      await post('/orgs/abc/products', { name: 'Paquete', kind: 'PACKAGE', priceCents: -5, credits: 3 }),
      /precio/,
    ],
  ];
  for (const [name, res, rx] of cases) out.push([name, res.status === 422 && rx.test(res.message), `${res.status} ${res.message}`]);

  const all = cases.map(([, x]) => x);
  out.push(['Ninguna respuesta muestra el esquema ni lo enviado', all.every((x) => !/"(expected|found|errors|schema)"/.test(x.text))]);
  out.push(['Ningún mensaje está en inglés', all.every((x) => !/expected|property|required|string|format/i.test(x.message))]);

  await post('/me/password', { newPassword: { x: secret } });
  await post('/orgs', { name: secret });
  out.push([
    'El log registra la validación pero no los valores enviados',
    logged.some((l) => l.includes('VALIDATION')) && !logged.some((l) => l.includes(secret)),
    `${logged.length} líneas`,
  ]);
} catch (e) {
  console.error = origError;
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  console.error = origError;
  if (userId) await db.delete(schema.user).where(eq(schema.user.id, userId));
  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else if (!process.exitCode) console.log(`\n${out.length} comprobaciones pasaron.`);
  process.exit(process.exitCode ?? 0);
}
