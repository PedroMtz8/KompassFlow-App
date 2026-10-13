/**
 * Prueba del correo transaccional contra un Resend falso (no envía nada real):
 *  - confirmación de correo al registrarse (y el enlace la confirma); no se manda a cuentas que crea una academia;
 *  - recuperación de contraseña: enlace de un solo uso, la nueva funciona y la vieja no, sin revelar si el correo existe;
 *  - invitación por correo y aviso de clase cancelada (uno por persona);
 *  - si Resend falla o no hay llave, nada se rompe; los datos se escapan en el HTML.
 *   bun --env-file=.env scripts/email-check.ts
 */
import { createServer } from 'node:http';

import { eq, inArray } from 'drizzle-orm';

type Mail = { to: string[]; subject: string; html: string; text: string; auth: string; from: string };
const inbox: Mail[] = [];
let failNext = false;
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (failNext) {
      failNext = false;
      res.statusCode = 500;
      return res.end('boom');
    }
    const m = JSON.parse(body);
    inbox.push({ ...m, auth: String(req.headers.authorization ?? '') });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'x' }));
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
Object.assign(process.env, { RESEND_API_KEY: 're_test_123', RESEND_BASE_URL: `http://localhost:${port}`, EMAIL_FROM: 'KompasFlow <no-reply@test.dev>' });

const { api } = await import('../src/server/app');
const { auth } = await import('../src/server/auth');
const { db, schema } = await import('../src/server/db');
const { createOrganization } = await import('../src/server/db/organizations');
const { createManagedAccount } = await import('../src/server/db/accounts');
const { cancelSession } = await import('../src/server/db/classes');
const { inviteMember } = await import('../src/server/db/team');
const { sendInvitation } = await import('../src/server/emails/send');

const tag = `zz-mail-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const post = (path: string, body: unknown) => api.handle(new Request(`http://localhost/api${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) }));
const mailTo = (email: string) => inbox.filter((m) => m.to.includes(email));
const settle = () => new Promise((r) => setTimeout(r, 400));
const linkIn = (m: Mail, rx: RegExp) => m.html.replace(/&amp;/g, '&').match(rx)?.[0];

try {
  // ── Confirmación de correo ──────────────────────────────────────────────────
  const email = `${tag}-ana@example.com`;
  const up = await auth.api.signUpEmail({ body: { email, password: 'clave-segura-123', name: 'Ana Prueba' } });
  ids.push(up.user.id);
  await settle();
  const verify = mailTo(email)[0];
  out.push(['Al registrarse llega el correo de confirmación', !!verify && /Confirma tu correo/.test(verify.subject) && verify.from.includes('no-reply@test.dev') && verify.auth === 'Bearer re_test_123']);
  out.push(['Está en español y trae el nombre', !!verify && /Hola Ana/.test(verify.text) && /Confirmar mi correo/.test(verify.html)]);
  const vLink = verify && linkIn(verify, /http:\/\/[^"\s<]*verify-email\?token=[^"\s<]*/);
  out.push(['Trae un enlace de confirmación', !!vLink]);
  if (vLink) {
    const r = await api.handle(new Request(vLink, { headers: H, redirect: 'manual' }));
    const u = await db.query.user.findFirst({ where: eq(schema.user.id, up.user.id) });
    out.push(['El enlace confirma el correo', r.status < 400 && u?.emailVerified === true, `${r.status}`]);
  }

  // ── Recuperar contraseña ────────────────────────────────────────────────────
  inbox.length = 0;
  const rp = await post('/auth/request-password-reset', { email, redirectTo: 'http://localhost:8081/reset-password' });
  await settle();
  const reset = mailTo(email)[0];
  out.push(['Pedir recuperación manda el correo', rp.ok && !!reset && /Restablece tu contraseña/.test(reset.subject)]);
  const ghost = await post('/auth/request-password-reset', { email: `${tag}-nadie@example.com`, redirectTo: 'http://localhost:8081/reset-password' });
  await settle();
  out.push(['Con un correo inexistente responde igual y no manda nada', ghost.status === rp.status && mailTo(`${tag}-nadie@example.com`).length === 0, `${ghost.status} vs ${rp.status}`]);
  const rLink = reset && linkIn(reset, /http:\/\/[^"\s<]*reset-password\/[^"\s<]*/);
  out.push(['Trae el enlace de recuperación', !!rLink]);
  if (rLink) {
    const hop = await api.handle(new Request(rLink, { headers: H, redirect: 'manual' }));
    const loc = hop.headers.get('location') ?? '';
    const token = new URL(loc, 'http://localhost').searchParams.get('token') ?? '';
    out.push(['El enlace lleva a la pantalla con un token', loc.startsWith('http://localhost:8081/reset-password') && token.length > 10, loc.slice(0, 70)]);
    const set = await post('/auth/reset-password', { newPassword: 'nueva-clave-segura-1', token });
    out.push(['Con el token se crea la contraseña nueva', set.ok]);
    out.push(['Entra con la nueva', (await post('/auth/sign-in/email', { email, password: 'nueva-clave-segura-1' })).ok]);
    out.push(['La anterior ya no sirve', (await post('/auth/sign-in/email', { email, password: 'clave-segura-123' })).status === 401]);
    out.push(['El token no se puede usar dos veces', !(await post('/auth/reset-password', { newPassword: 'otra-clave-segura-2', token })).ok]);
  }

  // ── Academia, invitación, cuentas y cancelaciones ───────────────────────────
  const owner = await auth.api.signUpEmail({ body: { email: `${tag}-owner@example.com`, password: 'clave-segura-123', name: 'Dueña Prueba' } });
  ids.push(owner.user.id);
  const org = await createOrganization(owner.user.id, { name: `ZZ <b>Mail</b> ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  inbox.length = 0;
  const invited = `${tag}-invitada@example.com`;
  const inv = await inviteMember(owner.user.id, 'owner', orgId, invited, 'instructor');
  const im = mailTo(invited)[0];
  out.push(['Invitar manda el correo con academia, quien invita y rol', 'id' in inv && !!im && /te invitó/.test(im.subject) && /instructor/.test(im.text) && /Dueña Prueba/.test(im.text)]);
  out.push(['Los datos de la academia se escapan en el HTML', !!im && !im.html.includes('<b>Mail</b>') && im.html.includes('&lt;b&gt;Mail&lt;/b&gt;')]);
  out.push(['El correo de invitación enlaza a entrar a la app', !!im && /http:\/\/localhost:8081\/sign-in/.test(im.html)]);

  inbox.length = 0;
  const made = await createManagedAccount({ userId: owner.user.id, role: 'owner' }, orgId, { name: 'Cuenta Academia', email: `${tag}-creada@example.com`, kind: 'student' });
  if ('userId' in made && made.userId) ids.push(made.userId);
  await settle();
  out.push(['Una cuenta creada por la academia NO recibe correo de confirmación', 'userId' in made && mailTo(`${tag}-creada@example.com`).length === 0]);

  // Cancelación: dos sesiones de la misma serie, una alumna reservada en ambas, otra en una.
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'Salsa <i>Mail</i>', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const series = crypto.randomUUID();
  await db.insert(schema.sessionSeries).values({ id: series, organizationId: orgId, serviceId: svc, capacity: 5, weekdays: '[1]', startTime: '19:00', durationMin: 60, startDate: '2030-01-07', endDate: '2030-01-14', timezone: 'America/Mexico_City' });
  const mkSession = async (days: number, seriesId: string | null) => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({ id, organizationId: orgId, serviceId: svc, seriesId, startsAt: new Date(Date.now() + days * 86400e3), endsAt: new Date(Date.now() + days * 86400e3 + 3600e3), capacity: 5, status: 'SCHEDULED' });
    return id;
  };
  const hasSeries = true;
  const s1 = await mkSession(5, hasSeries ? series : null);
  const s2 = await mkSession(12, hasSeries ? series : null);
  const mkStudent = async (name: string, mail: string | null) => {
    const id = crypto.randomUUID();
    await db.insert(schema.student).values({ id, organizationId: orgId, name, email: mail });
    return id;
  };
  const book = (sid: string, stid: string) => db.insert(schema.booking).values({ id: crypto.randomUUID(), organizationId: orgId, sessionId: sid, studentId: stid, status: 'CONFIRMED', source: 'STAFF' });
  const luz = await mkStudent('Luz Mail', `${tag}-luz@example.com`);
  const sin = await mkStudent('Sin Correo', null);
  await book(s1, luz);
  await book(s2, luz);
  await book(s1, sin);
  inbox.length = 0;
  const c = await cancelSession(owner.user.id, orgId, s1, hasSeries ? 'following' : 'one');
  await settle();
  const luzMails = mailTo(`${tag}-luz@example.com`);
  out.push(['Cancelar una clase avisa por correo a quien reservó', 'canceled' in c && luzMails.length === 1 && /Se canceló/.test(luzMails[0].subject)]);
  if (hasSeries) out.push(['Si cancela varias de la serie, es UN correo con el rango', luzMails.length === 1 && /2 clases/.test(luzMails[0].text), luzMails[0]?.text.match(/del [^.]*\./)?.[0] ?? '']);
  out.push(['El nombre del servicio se escapa en el HTML', luzMails[0]?.html.includes('&lt;i&gt;Mail&lt;/i&gt;') === true]);
  out.push(['Quien no tiene correo no rompe nada', inbox.length === luzMails.length]);

  // ── Fallos ──────────────────────────────────────────────────────────────────
  failNext = true;
  const failing = await sendInvitation(`${tag}-x@example.com`, { inviter: 'A', organization: 'B', role: 'staff' });
  out.push(['Si Resend responde error, no lanza (devuelve ok: false)', failing.ok === false]);
  failNext = true;
  const inv2 = await inviteMember(owner.user.id, 'owner', orgId, `${tag}-otra@example.com`, 'staff');
  out.push(['Y la invitación se crea igual', 'id' in inv2]);
  delete process.env.RESEND_API_KEY;
  const before = inbox.length;
  const none = await sendInvitation(`${tag}-y@example.com`, { inviter: 'A', organization: 'B', role: 'staff' });
  out.push(['Sin llave no se envía nada y no falla', none.ok && none.skipped === true && inbox.length === before]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (orgId) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
  if (ids.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }
  server.close();
  process.exit(process.exitCode ?? 0);
}
