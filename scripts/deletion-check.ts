/**
 * Prueba de eliminación de cuenta y de academia:
 *  - quien es la única propietaria de una academia no puede borrar su cuenta (y se le dice cuál);
 *  - solo la propietaria elimina la academia, escribiendo su nombre; todo lo suyo se borra y las reservas próximas reciben aviso;
 *  - al borrar la cuenta se pide la contraseña, los datos personales del alumno se anonimizan y sus pagos y asistencias se conservan.
 *   bun --env-file=.env scripts/deletion-check.ts
 */
import { createServer } from 'node:http';

import { and, eq, inArray, like } from 'drizzle-orm';

type Mail = { to: string[]; subject: string; text: string };
const inbox: Mail[] = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    inbox.push(JSON.parse(body));
    res.setHeader('content-type', 'application/json');
    res.end('{"id":"x"}');
  });
});
await new Promise<void>((r) => server.listen(0, r));
Object.assign(process.env, { RESEND_API_KEY: 're_test', RESEND_BASE_URL: `http://localhost:${(server.address() as { port: number }).port}`, EMAIL_FROM: 'KompassFlow <no-reply@test.dev>' });

const { api } = await import('../src/server/app');
const { db, schema } = await import('../src/server/db');
const { createOrganization } = await import('../src/server/db/organizations');

const tag = `zz-del-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
const orgs: string[] = [];
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  api.handle(new Request(`http://localhost/api${path}`, { method, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
const settle = () => new Promise((r) => setTimeout(r, 400));
const PW = 'clave-segura-123';

async function signUp(label: string) {
  const email = `${tag}-${label}@example.com`;
  const r = await call('POST', '/auth/sign-up/email', undefined, { email, password: PW, name: `ZZ ${label}` });
  const id = ((await r.json()) as { user: { id: string } }).user.id;
  ids.push(id);
  return { id, email, cookie: cookieOf(r) };
}
const mkOrg = async (owner: string, name: string) => {
  const o = await createOrganization(owner, { name, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in o) throw new Error(o.error);
  orgs.push((o as { id: string }).id);
  return (o as { id: string }).id;
};

try {
  const owner = await signUp('owner');
  const admin = await signUp('admin');
  const alum = await signUp('alumna');
  const orgName = `ZZ Del ${tag}`;
  const orgId = await mkOrg(owner.id, orgName);
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: admin.id, role: 'admin', createdAt: new Date() });

  // Datos de la alumna: registro con teléfono, reserva próxima, pago y asistencia.
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'Salsa Del', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const sess = crypto.randomUUID();
  await db.insert(schema.classSession).values({ id: sess, organizationId: orgId, serviceId: svc, instructorUserId: alum.id, startsAt: new Date(Date.now() + 3 * 86400e3), endsAt: new Date(Date.now() + 3 * 86400e3 + 3600e3), capacity: 5, status: 'SCHEDULED' });
  const stId = crypto.randomUUID();
  await db.insert(schema.student).values({ id: stId, organizationId: orgId, userId: alum.id, name: 'ZZ alumna', email: alum.email, phone: '3110001111', notes: 'nota privada' });
  const bk = crypto.randomUUID();
  await db.insert(schema.booking).values({ id: bk, organizationId: orgId, sessionId: sess, studentId: stId, status: 'CONFIRMED', source: 'STUDENT' });
  await db.insert(schema.attendance).values({ organizationId: orgId, sessionId: sess, bookingId: bk, studentId: stId, status: 'PRESENT' });
  const pay = crypto.randomUUID();
  await db.insert(schema.payment).values({ id: pay, organizationId: orgId, studentId: stId, concept: 'Mensualidad', amountCents: 50000, method: 'CASH', status: 'PAID', paidAt: new Date() });
  await db.insert(schema.invitation).values({ id: crypto.randomUUID(), organizationId: orgId, email: alum.email, role: 'staff', status: 'pending', expiresAt: new Date(Date.now() + 86400e3), inviterId: owner.id });

  // ── Cuenta ─────────────────────────────────────────────────────────────────
  const del = (c: string, body: unknown) => call('POST', '/me/delete', c, body);
  const blocked = await del(owner.cookie, { confirm: 'ELIMINAR', password: PW });
  const bj = (await blocked.json()) as { code?: string; message?: string };
  out.push(['La única propietaria no puede borrar su cuenta y se le dice cuál academia', blocked.status === 409 && bj.code === 'OWNS_ORGANIZATIONS' && !!bj.message?.includes(orgName)]);
  out.push(['Sin escribir ELIMINAR se rechaza', (await del(alum.cookie, { confirm: 'borrar', password: PW })).status === 422]);
  out.push(['Sin contraseña se rechaza', (await del(alum.cookie, { confirm: 'ELIMINAR' })).status === 422]);
  out.push(['Con una contraseña incorrecta se rechaza (403)', (await del(alum.cookie, { confirm: 'ELIMINAR', password: 'incorrecta-123' })).status === 403]);
  out.push(['Sin sesión recibe 401', (await del('', { confirm: 'ELIMINAR', password: PW })).status === 401]);

  inbox.length = 0;
  const ok = await del(alum.cookie, { confirm: 'eliminar', password: PW });
  await settle();
  out.push(['Con la contraseña y ELIMINAR, se borra la cuenta', ok.ok]);
  out.push(['El usuario ya no existe', !(await db.query.user.findFirst({ where: eq(schema.user.id, alum.id) }))]);
  out.push(['Su sesión dejó de servir', (await call('GET', '/me', alum.cookie)).status === 401]);
  out.push(['Ya no puede entrar', (await call('POST', '/auth/sign-in/email', undefined, { email: alum.email, password: PW })).status === 401]);
  const st = await db.query.student.findFirst({ where: eq(schema.student.id, stId) });
  out.push(['Su registro de alumna queda anonimizado', st?.name === 'Cuenta eliminada' && st.email === null && st.phone === null && st.notes === null && st.userId === null]);
  out.push(['Pero la academia conserva la reserva, la asistencia y el pago', !!(await db.query.booking.findFirst({ where: eq(schema.booking.id, bk) })) && !!(await db.query.attendance.findFirst({ where: eq(schema.attendance.bookingId, bk) })) && !!(await db.query.payment.findFirst({ where: eq(schema.payment.id, pay) }))]);
  out.push(['Las invitaciones a su correo se borran', !(await db.query.invitation.findFirst({ where: eq(schema.invitation.email, alum.email) }))]);
  const cls = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, sess) });
  out.push(['La clase que daba queda sin instructora (no se borra)', !!cls && cls.instructorUserId === null]);
  out.push(['Recibe el aviso de que se eliminó', inbox.some((m) => m.to.includes(alum.email) && /Eliminamos tu cuenta/.test(m.subject))]);
  const aud = await db.query.auditLog.findFirst({ where: and(eq(schema.auditLog.entityId, alum.id), eq(schema.auditLog.action, 'user.deleted')) });
  out.push(['Queda constancia en la bitácora (sin vínculo a la cuenta borrada)', !!aud && aud.actorUserId === null]);

  // Cuenta solo con Google: exige una sesión reciente.
  const g = await signUp('google');
  await db.delete(schema.account).where(and(eq(schema.account.userId, g.id), eq(schema.account.providerId, 'credential')));
  await db.insert(schema.account).values({ id: crypto.randomUUID(), accountId: `g-${tag}`, providerId: 'google', userId: g.id, createdAt: new Date(), updatedAt: new Date() });
  await db.update(schema.session).set({ createdAt: new Date(Date.now() - 3600e3) }).where(eq(schema.session.userId, g.id));
  const old = await del(g.cookie, { confirm: 'ELIMINAR' });
  const oj = (await old.json()) as { code?: string };
  out.push(['Con Google y sesión vieja pide volver a entrar', old.status === 403 && oj.code === 'REAUTH_REQUIRED']);
  await db.update(schema.session).set({ createdAt: new Date() }).where(eq(schema.session.userId, g.id));
  out.push(['Con sesión reciente la borra sin contraseña', (await del(g.cookie, { confirm: 'ELIMINAR' })).ok]);

  // ── Academia ───────────────────────────────────────────────────────────────
  const delOrg = (c: string, name: string) => call('DELETE', `/orgs/${orgId}`, c, { confirmName: name });
  out.push(['Un administrador no puede eliminar la academia', (await delOrg(admin.cookie, orgName).then((r) => r.status)) === 403]);
  const outsider = await signUp('otra');
  out.push(['Una persona ajena recibe 404', (await delOrg(outsider.cookie, orgName).then((r) => r.status)) === 404]);
  out.push(['Con el nombre equivocado se rechaza', (await delOrg(owner.cookie, 'otro nombre').then((r) => r.status)) === 422]);
  // Otra persona con reserva próxima para comprobar el aviso.
  const guest = await signUp('invitada');
  const gst = crypto.randomUUID();
  await db.insert(schema.student).values({ id: gst, organizationId: orgId, userId: guest.id, name: 'ZZ invitada', email: guest.email });
  await db.insert(schema.booking).values({ id: crypto.randomUUID(), organizationId: orgId, sessionId: sess, studentId: gst, status: 'CONFIRMED', source: 'STUDENT' });
  inbox.length = 0;
  const gone = await delOrg(owner.cookie, orgName.toUpperCase());
  await settle();
  out.push(['La propietaria la elimina escribiendo su nombre', gone.ok]);
  out.push(['La academia, sus alumnos y clases desaparecen', !(await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) })) && !(await db.query.service.findFirst({ where: eq(schema.service.id, svc) })) && !(await db.query.student.findFirst({ where: eq(schema.student.id, gst) }))]);
  out.push(['Quien tenía reserva próxima recibe aviso', inbox.some((m) => m.to.includes(guest.email) && /Se canceló/.test(m.subject) && m.text.includes(orgName))]);
  const oa = await db.query.auditLog.findFirst({ where: and(eq(schema.auditLog.entityId, orgId), eq(schema.auditLog.action, 'organization.deleted')) });
  out.push(['La bitácora conserva que se eliminó', !!oa && oa.actorUserId === owner.id]);
  out.push(['Ya sin academias, la propietaria puede borrar su cuenta', (await del(owner.cookie, { confirm: 'ELIMINAR', password: PW })).ok]);

  // Con otra propietaria no bloquea.
  const o1 = await signUp('co1');
  const o2 = await signUp('co2');
  const org2 = await mkOrg(o1.id, `ZZ Co ${tag}`);
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: org2, userId: o2.id, role: 'owner', createdAt: new Date() });
  out.push(['Si hay otra propietaria, no bloquea el borrado', (await del(o1.cookie, { confirm: 'ELIMINAR', password: PW })).ok]);

  for (const [name, pass, detail] of out) console.log(`${pass ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, p]) => !p)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (orgs.length) await db.delete(schema.organization).where(inArray(schema.organization.id, orgs));
  await db.delete(schema.user).where(like(schema.user.email, `${tag}-%`));
  await db.delete(schema.auditLog).where(inArray(schema.auditLog.entityId, [...ids, ...orgs]));
  server.close();
  process.exit(process.exitCode ?? 0);
}
