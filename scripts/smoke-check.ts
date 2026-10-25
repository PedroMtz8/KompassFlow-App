/**
 * Prueba de humo contra el servidor REAL de Expo (Metro + runtime de Node), no contra Bun: ahí se ven diferencias que las demás
 * pruebas no ven (por ejemplo, una respuesta 204 con cuerpo vacío es válida en Bun y rompe en Node). Levanta `expo start` en el
 * puerto 8090, revisa lo esencial (salud, validación, registro, correos con React Email) y lo apaga. Tarda ~1 min:
 * es opcional y necesita una base REMOTA (Metro no abre SQLite local): `bun run test smoke --remote` (crea y borra un usuario zz-smoke-…).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const mails: { to: string[]; subject: string; html: string }[] = [];
const resend = createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    mails.push(JSON.parse(b));
    res.end('{"id":"x"}');
  });
});
await new Promise<void>((r) => resend.listen(0, r));
const rport = (resend.address() as { port: number }).port;

const PORT = 8090;
const BASE = `http://localhost:${PORT}`;
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const out: [string, boolean, string?][] = [];
const metro = spawn('npx', ['expo', 'start', '--port', String(PORT)], {
  env: { ...process.env, CI: '1', NODE_OPTIONS: '--max-old-space-size=8192', RESEND_API_KEY: 're_smoke', RESEND_BASE_URL: `http://localhost:${rport}`, EMAIL_FROM: 'Kompass <no-reply@smoke.dev>' } as NodeJS.ProcessEnv,
  stdio: 'ignore',
  detached: true,
});
const stop = () => {
  try {
    process.kill(-metro.pid!);
  } catch {
    /* ya terminó */
  }
};
const tag = `zz-smoke-${Date.now()}`;
const email = `${tag}@gmail.com`;

try {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      up = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(60_000) })).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  out.push(['El servidor de Expo arranca y /api/health responde', up]);
  if (up) {
    const j = async (path: string, init?: RequestInit) => {
      const r = await fetch(`${BASE}/api${path}`, { headers: H, ...init });
      return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
    };
    const health = await j('/health');
    out.push(['/health confirma la base de datos', health.body?.ok === true && health.body?.db === true]);
    out.push(['Sin sesión, /me responde 401', (await j('/me')).status === 401]);
    const bad = await j('/orgs/abc/students', { method: 'POST', body: JSON.stringify({ name: 'A' }) });
    out.push(['Una validación fallida responde 422 en español, sin detalles internos', bad.status === 401 || (bad.status === 422 && /demasiado corto/.test(bad.body?.message ?? '') && !JSON.stringify(bad.body).includes('expected')), `${bad.status}`]);
    const ce = await j('/client-errors', { method: 'POST', body: JSON.stringify({ message: 'prueba de humo' }) });
    out.push(['/client-errors responde 200 (no 204: Node lo rechaza)', ce.status === 200]);

    const su = await j('/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ email, password: 'clave-segura-123', name: 'Humo Prueba' }) });
    out.push(['Registro con correo y contraseña', su.status === 200 && !!su.body?.user?.id]);
    await new Promise((r) => setTimeout(r, 1500));
    const verify = mails.find((m) => m.to.includes(email));
    out.push(['React Email renderiza dentro de Metro: llega el correo de confirmación', !!verify && /Confirma tu correo/.test(verify.subject) && verify.html.includes('verify-email?token='), verify?.subject]);

    const cookie = su.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const me = await j('/orgs', { headers: { ...H, cookie } });
    out.push(['Con la sesión recién creada, /orgs responde 200', me.status === 200 && Array.isArray(me.body)]);
    mails.length = 0;
    const rp = await j('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: 'http://localhost:8081/reset-password' }) });
    await new Promise((r) => setTimeout(r, 1500));
    const reset = mails.find((m) => m.to.includes(email));
    out.push(['Pedir recuperación manda el correo con el enlace', rp.status === 200 && !!reset && reset.html.includes('reset-password/'), reset?.subject]);
    // Limpieza del usuario de prueba (el servidor usa la base temporal del corredor).
    await j('/me/delete', { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify({ confirm: 'ELIMINAR', password: 'clave-segura-123' }) });
  }
  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  stop();
  // Por si la prueba se cortó a la mitad: no deja usuarios de prueba en la base.
  try {
    const { like } = await import('drizzle-orm');
    const { db, schema } = await import('../src/server/db');
    await db.delete(schema.user).where(like(schema.user.email, 'zz-smoke-%'));
  } catch {
    /* sin acceso a la base */
  }
  resend.close();
  process.exit(process.exitCode ?? 0);
}
