/**
 * Prueba del monitoreo contra un Sentry falso: un error inesperado se reporta (con traza, sin datos sensibles) y la persona recibe
 * un mensaje claro con una referencia; los errores esperados (validación, 401, 404) no se reportan; los repetidos no inundan;
 * los errores de la app llegan por /client-errors con límite; /health revisa la base; un correo que falla avisa como advertencia.
 */
import { createServer } from 'node:http';

import { eq } from 'drizzle-orm';

type Envelope = { path: string; auth: string; header: Record<string, unknown>; event: Record<string, any>; raw: string };
const inbox: Envelope[] = [];
const sentry = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const [h, , e] = raw.split('\n');
    inbox.push({ path: req.url ?? '', auth: String(req.headers['x-sentry-auth'] ?? ''), header: JSON.parse(h), event: JSON.parse(e), raw });
    res.end('{}');
  });
});
let resendStatus = 200;
const resend = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.statusCode = resendStatus;
    res.end('{"id":"x"}');
  });
});
await Promise.all([new Promise<void>((r) => sentry.listen(0, r)), new Promise<void>((r) => resend.listen(0, r))]);
const sp = (sentry.address() as { port: number }).port;
const rp = (resend.address() as { port: number }).port;
Object.assign(process.env, { SENTRY_DSN: `http://pubkey123@localhost:${sp}/42`, SENTRY_ENVIRONMENT: 'test', RESEND_API_KEY: 're_x', RESEND_BASE_URL: `http://localhost:${rp}` });

const { api } = await import('../src/server/app');
const { db, schema } = await import('../src/server/db');
const { sendInvitation } = await import('../src/server/emails/send');
const { reportError } = await import('../src/server/lib/report');

const tag = `zz-mon-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const call = (method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) =>
  api.handle(new Request(`http://localhost/api${path}`, { method, headers: { ...H, ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
const settle = () => new Promise((r) => setTimeout(r, 500));
let userId = '';

try {
  const r = await call('POST', '/auth/sign-up/email', undefined, { email: `${tag}@example.com`, password: 'clave-segura-123', name: 'ZZ mon' });
  userId = ((await r.json()) as { user: { id: string } }).user.id;
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const token = cookie.split('=')[1]?.split(';')[0] ?? '';

  // ── Un error inesperado ────────────────────────────────────────────────────
  inbox.length = 0;
  const member = db.query.member as { findFirst: (...a: unknown[]) => unknown };
  const original = member.findFirst;
  member.findFirst = () => {
    throw new Error('SQLITE_ERROR: no such table: secreto_interno');
  };
  const res = await call('GET', '/orgs/cualquiera/team', cookie);
  member.findFirst = original;
  await settle();
  const body = (await res.json()) as { message?: string; ref?: string };
  out.push(['Un error inesperado responde 500 con un mensaje claro y una referencia', res.status === 500 && /error inesperado/.test(body.message ?? '') && /^[0-9a-f]{8}$/.test(body.ref ?? '')]);
  out.push(['La respuesta NO deja ver detalles internos (SQL, tablas, trazas)', !JSON.stringify(body).match(/SQLITE|secreto_interno|at \w/)]);
  const ev = inbox[0];
  out.push(['Llegó a Sentry a la ruta del proyecto con la llave pública', inbox.length === 1 && ev.path === '/api/42/envelope/' && ev.auth.includes('sentry_key=pubkey123')]);
  out.push(['El evento trae el error, la traza, la ruta y el entorno', !!ev && ev.event.exception.values[0].value.includes('secreto_interno') && ev.event.exception.values[0].stacktrace.frames.length > 0 && ev.event.request.url.includes('/orgs/') && ev.event.environment === 'test' && ev.event.level === 'error']);
  out.push(['No lleva cookies, tokens ni cabeceras', !!ev && !ev.raw.includes(token) && !ev.raw.toLowerCase().includes('cookie') && !ev.raw.includes('clave-segura')]);
  out.push(['La referencia que ve la persona es el id del evento', !!ev && String(ev.event.event_id).startsWith(body.ref ?? '#')]);

  // ── Repetidos ───────────────────────────────────────────────────────────────
  inbox.length = 0;
  member.findFirst = () => {
    throw new Error('mismo error repetido');
  };
  for (let i = 0; i < 6; i++) await call('GET', '/orgs/cualquiera/team', cookie);
  member.findFirst = original;
  await settle();
  out.push(['El mismo error repetido 6 veces se manda una sola vez', inbox.length === 1, `${inbox.length}`]);

  // ── Lo esperado no se reporta ──────────────────────────────────────────────
  inbox.length = 0;
  await call('POST', '/orgs', cookie, { name: 'x' }); // validación
  await call('GET', '/me', undefined); // sin sesión
  await call('GET', '/orgs/no-existe/team', cookie); // 404
  await call('GET', '/ruta-que-no-existe', cookie);
  await settle();
  out.push(['Validación, 401 y 404 no se reportan', inbox.length === 0, `${inbox.length}`]);

  // ── Errores de la app (cliente) ────────────────────────────────────────────
  inbox.length = 0;
  const ce = await call('POST', '/client-errors', undefined, { message: 'undefined is not a function', stack: 'at render (App.tsx:10:3)', screen: '/discover', platform: 'ios', version: '1.0.0' }, { 'x-forwarded-for': '1.2.3.4' });
  await settle();
  out.push(['La app puede reportar un error sin tener sesión (200)', ce.status === 200 && inbox.length === 1 && inbox[0].event.tags.source === 'client' && inbox[0].event.tags.screen === '/discover' && inbox[0].event.tags.platform === 'ios']);
  const big = await call('POST', '/client-errors', undefined, { message: 'x'.repeat(5000) });
  out.push(['Un mensaje enorme se rechaza (validación)', big.status === 422]);
  const bad = await call('POST', '/client-errors', undefined, 'esto no es json');
  out.push(['Un cuerpo que no es JSON no rompe nada', bad.status >= 400 && bad.status < 500]);
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await call('POST', '/client-errors', undefined, { message: `e${i}` }, { 'x-forwarded-for': '9.9.9.9' })).status === 429) limited++;
  out.push(['Un mismo origen no puede inundar el reporte (límite por minuto)', limited >= 4, `${limited} rechazados`]);

  await settle();

  // ── Salud ──────────────────────────────────────────────────────────────────
  const h = await call('GET', '/health');
  const hj = (await h.json()) as { ok: boolean; db: boolean };
  out.push(['/health responde 200 y confirma la base de datos', h.status === 200 && hj.ok && hj.db]);
  const dbRun = db as unknown as { run: (...a: unknown[]) => unknown };
  const origRun = dbRun.run;
  dbRun.run = () => Promise.reject(new Error('base caída'));
  inbox.length = 0;
  const hd = await call('GET', '/health');
  dbRun.run = origRun;
  await settle();
  out.push(['Con la base caída /health responde 503 (para el monitor) sin llenar Sentry', hd.status === 503 && ((await hd.json()) as { ok: boolean }).ok === false && inbox.length === 0, `status ${hd.status}, eventos ${inbox.length}`]);

  // ── Correo que falla ───────────────────────────────────────────────────────
  inbox.length = 0;
  resendStatus = 500;
  const mail = await sendInvitation(`${tag}-x@gmail.com`, { inviter: 'A', organization: 'B', role: 'staff' });
  resendStatus = 200;
  await settle();
  out.push(['Un correo que Resend rechaza avisa como advertencia (y no lanza)', mail.ok === false && inbox.length === 1 && inbox[0].event.level === 'warning' && inbox[0].event.tags.source === 'email']);

  // ── Sin Sentry ─────────────────────────────────────────────────────────────
  delete process.env.SENTRY_DSN;
  inbox.length = 0;
  const id = reportError(new Error('sin dsn'));
  await settle();
  out.push(['Sin SENTRY_DSN solo queda en el log, sin fallar', /^[0-9a-f]{8}$/.test(id) && inbox.length === 0]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (userId) await db.delete(schema.user).where(eq(schema.user.id, userId));
  sentry.close();
  resend.close();
  process.exit(process.exitCode ?? 0);
}
