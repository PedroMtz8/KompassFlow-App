/**
 * Prueba de avisos, push y recordatorios (con un servicio de push de Expo FALSO, sin red):
 *  - los dispositivos se registran (formato válido), pasan a la cuenta que los usa y los muertos se borran solos;
 *  - cada aviso se guarda en la bandeja y se manda por push; si la persona apagó esa categoría no pasa nada;
 *  - solo se ve y se marca lo propio;
 *  - eventos reales: reservar por la academia, cancelar, cancelar una clase, transferencia avisada/confirmada;
 *  - recordatorios: una clase en la próxima hora avisa UNA vez (aunque el trabajo corra dos veces a la vez); no avisa
 *    canceladas, lejanas ni reservas hechas hace menos de una hora; paquetes por vencer avisan una sola vez;
 *  - el trabajo programado exige el secreto.
 *   bun --env-file=.env scripts/notifications-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

declare const Bun: { serve: (o: { port: number; fetch: (r: Request) => Response | Promise<Response> }) => { port: number; stop: (f?: boolean) => void } };

type Sent = { to: string; title: string; body: string; data?: { url?: string } };
const sent: Sent[] = [];
const fake = Bun.serve({
  port: 0,
  async fetch(req: Request) {
    const msgs = (await req.json()) as Sent[];
    sent.push(...msgs);
    return Response.json({ data: msgs.map((m) => (m.to.includes('dead') ? { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'tk' })) });
  },
});
process.env.EXPO_PUSH_URL = `http://localhost:${fake.port}/push`;
process.env.CRON_SECRET = 'secreto-del-planificador-1234567890';

const { api } = await import('../src/server/app');
const { db, schema } = await import('../src/server/db');
const { createOrganization } = await import('../src/server/db/organizations');
const { createProduct, savePaymentSettings } = await import('../src/server/db/payments');
const { notify, runReminders } = await import('../src/server/db/notifications');

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-ntf-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';

try {
  const mk = async (label: string) => {
    const r = await api.handle(new Request('http://localhost/api/auth/sign-up/email', { method: 'POST', headers: H, body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }) }));
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    return { id, cookie };
  };
  const call = async (who: { cookie: string } | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, ...(who ? { cookie: who.cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const rene = await mk('rene'); // recepción
  const ana = await mk('ana');
  const bea = await mk('bea');
  const org = await createOrganization(owner.id, { name: `ZZ Ntf ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: rene.id, role: 'staff', createdAt: new Date() });
  await savePaymentSettings(owner.id, orgId, { acceptsCash: true, acceptsTransfer: true, bank: 'BBVA', clabe: '012345678901234567', beneficiary: 'ZZ' });
  const pack = (await createProduct(owner.id, orgId, { name: 'Paquete 4', kind: 'PACKAGE', priceCents: 40000, credits: 4, validityDays: 30 })) as { id: string };

  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ Bachata', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const MIN = 60_000;
  const session = async (minutesFromNow: number, status: 'SCHEDULED' | 'CANCELED' = 'SCHEDULED') => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({ id, organizationId: orgId, serviceId: svc, startsAt: new Date(Date.now() + minutesFromNow * MIN), endsAt: new Date(Date.now() + (minutesFromNow + 60) * MIN), capacity: 10, status });
    return id;
  };
  const anaSt = crypto.randomUUID();
  await db.insert(schema.student).values({ id: anaSt, organizationId: orgId, userId: ana.id, name: 'Ana' });
  const listOf = async (who: { cookie: string }) => (await call(who, 'GET', '/me/notifications')).json as { unread: number; items: { id: string; title: string; body: string; url: string | null; readAt: string | null }[] };

  // ── Dispositivos y preferencias ────────────────────────────────────────────
  const bad = await call(ana, 'POST', '/me/push-token', { token: 'no-es-un-token-de-expo-123456', platform: 'ios' });
  out.push(['Un token con formato inválido se rechaza', bad.status === 422, `${bad.status}`]);
  const good = await call(ana, 'POST', '/me/push-token', { token: 'ExponentPushToken[ana-device-0001]', platform: 'ios' });
  const dead = await call(ana, 'POST', '/me/push-token', { token: 'ExponentPushToken[dead-device-0002]', platform: 'android' });
  out.push(['Se registran dos dispositivos', good.status === 200 && dead.status === 200 && (await call(ana, 'GET', '/me/notification-prefs')).json.devices === 2]);
  const prefs0 = (await call(ana, 'GET', '/me/notification-prefs')).json;
  out.push(['Por omisión todo está activo', prefs0.reminders && prefs0.classChanges && prefs0.payments && prefs0.team]);
  const anon = await call(null, 'GET', '/me/notifications');
  out.push(['Sin sesión no se ve nada', anon.status === 401, `${anon.status}`]);

  // ── Guardar y enviar ───────────────────────────────────────────────────────
  sent.length = 0;
  const id1 = await notify(ana.id, { category: 'class', title: 'Hola', body: 'Cuerpo', url: '/my-classes', organizationId: orgId });
  const l1 = await listOf(ana);
  out.push(['El aviso queda en la bandeja sin leer', !!id1 && l1.unread === 1 && l1.items[0].title === 'Hola' && l1.items[0].url === '/my-classes']);
  out.push(['Se manda push a los dispositivos con la ruta a abrir', sent.length === 2 && sent.every((m) => m.title === 'Hola' && m.data?.url === '/my-classes')]);
  const left = await call(ana, 'GET', '/me/notification-prefs');
  out.push(['El dispositivo que Expo dice que ya no existe se borra', left.json.devices === 1, `${left.json.devices}`]);

  // ── Preferencias ───────────────────────────────────────────────────────────
  await call(ana, 'PUT', '/me/notification-prefs', { reminders: true, classChanges: true, payments: false, team: true });
  sent.length = 0;
  const off = await notify(ana.id, { category: 'payment', title: 'Pago', body: 'x' });
  out.push(['Si apagó pagos, no se guarda ni se envía', off === null && sent.length === 0 && (await listOf(ana)).items.every((i) => i.title !== 'Pago')]);
  await call(ana, 'PUT', '/me/notification-prefs', { reminders: true, classChanges: true, payments: true, team: true });

  // ── Leer ───────────────────────────────────────────────────────────────────
  const foreign = await call(bea, 'POST', '/me/notifications/read', { ids: [id1] });
  out.push(['Otra persona no puede marcar tus avisos', foreign.status === 200 && (await listOf(ana)).unread === 1]);
  out.push(['Otra persona no ve tus avisos', (await listOf(bea)).items.length === 0]);
  await call(ana, 'POST', '/me/notifications/read', { ids: [id1] });
  out.push(['Marcar como leído baja el contador', (await listOf(ana)).unread === 0 && (await call(ana, 'GET', '/me/notifications/unread')).json.unread === 0]);

  // ── Eventos reales ─────────────────────────────────────────────────────────
  const s1 = await session(24 * 60);
  const byStaff = await call(rene, 'POST', `/orgs/${orgId}/sessions/${s1}/bookings`, { studentId: anaSt });
  let items = (await listOf(ana)).items;
  out.push(['Si la academia la reserva, ella recibe el aviso', byStaff.status === 200 && items.some((i) => i.title === 'Te reservaron una clase' && i.url?.startsWith('/booking?bookingId='))]);
  const cancelByStaff = await call(rene, 'POST', `/orgs/${orgId}/bookings/${byStaff.json.id}/cancel`);
  items = (await listOf(ana)).items;
  out.push(['Si la academia cancela su reserva, se le avisa', cancelByStaff.status === 200 && items.some((i) => i.title === 'Cancelaron tu reserva')]);

  const before = (await listOf(ana)).items.length;
  const s2 = await session(48 * 60);
  const own = await call(ana, 'POST', `/discover/sessions/${s2}/book`);
  out.push(['Si reserva ella misma no se avisa a sí misma', own.status === 200 && (await listOf(ana)).items.length === before]);
  const cancelOwn = await call(ana, 'POST', `/me/bookings/${own.json.id}/cancel`);
  out.push(['…ni cuando cancela ella', cancelOwn.status === 200 && (await listOf(ana)).items.length === before]);

  const s3 = await session(72 * 60);
  await call(ana, 'POST', `/discover/sessions/${s3}/book`);
  const cancelClass = await call(owner, 'POST', `/orgs/${orgId}/sessions/${s3}/cancel`, { scope: 'one' });
  items = (await listOf(ana)).items;
  out.push(['Si la academia cancela la clase, se avisa a quien tenía lugar', cancelClass.status === 200 && items.some((i) => /canceló tu clase/.test(i.title))]);

  // Transferencia: la alumna avisa → el equipo se entera; recepción confirma → ella se entera.
  const tr = await call(ana, 'POST', `/discover/products/${pack.id}/transfer`);
  await call(ana, 'POST', `/me/payments/${tr.json.id}/notify`, { trackingKey: 'CLAVE123' });
  const reneItems = (await listOf(rene)).items;
  const ownerItems = (await listOf(owner)).items;
  out.push(['Al avisar una transferencia, el equipo que confirma pagos se entera', reneItems.some((i) => i.title === 'Transferencia por confirmar') && ownerItems.some((i) => i.title === 'Transferencia por confirmar')]);
  out.push(['Quien no es del equipo no se entera', (await listOf(bea)).items.length === 0]);
  const conf = await call(rene, 'POST', `/orgs/${orgId}/payments/${tr.json.id}/confirm`);
  out.push(['Al confirmarla, la alumna recibe el aviso', conf.status === 200 && (await listOf(ana)).items.some((i) => i.title === 'Pago confirmado' && i.url === '/membership')]);

  // ── Recordatorios ──────────────────────────────────────────────────────────
  const book = async (sessionId: string, studentId: string, createdAgoMin: number, status: 'CONFIRMED' | 'CANCELED' = 'CONFIRMED') => {
    const id = crypto.randomUUID();
    await db.insert(schema.booking).values({ id, organizationId: orgId, sessionId, studentId, status, source: 'STAFF', createdAt: new Date(Date.now() - createdAgoMin * MIN) });
    return id;
  };
  const soon = await session(45);
  const b1 = await book(soon, anaSt, 180);
  const soonCanceled = await session(40);
  await book(soonCanceled, anaSt, 180, 'CANCELED');
  const cancelledSession = await session(30, 'CANCELED');
  await book(cancelledSession, anaSt, 180);
  const far = await session(150);
  await book(far, anaSt, 300);
  const lastMinute = await session(20);
  await book(lastMinute, anaSt, 10);

  const noSecret = await call(null, 'POST', '/jobs/reminders');
  const wrongSecret = await call(null, 'POST', '/jobs/reminders', undefined, { 'x-cron-secret': 'otro-secreto-cualquiera-1234567' });
  out.push(['El trabajo exige el secreto del planificador', noSecret.status === 401 && wrongSecret.status === 401, `${noSecret.status}/${wrongSecret.status}`]);

  sent.length = 0;
  const runs = await Promise.all([call(null, 'POST', '/jobs/reminders', undefined, { 'x-cron-secret': process.env.CRON_SECRET! }), call(null, 'POST', '/jobs/reminders', undefined, { 'x-cron-secret': process.env.CRON_SECRET! })]);
  const reminders = (await listOf(ana)).items.filter((i) => /Tu clase es hoy/.test(i.title));
  out.push(['Dos ejecuciones simultáneas avisan una sola vez', runs.every((r) => r.status === 200) && reminders.length === 1, `${reminders.length}`]);
  out.push(['Solo la clase de la próxima hora (no canceladas, lejanas ni reservadas hace minutos)', reminders[0]?.url === `/booking?bookingId=${b1}`, reminders.map((r) => r.url).join(',')]);
  const again = await call(null, 'POST', '/jobs/reminders', undefined, { 'x-cron-secret': process.env.CRON_SECRET! });
  out.push(['Una tercera ejecución no repite nada', again.json.classes === 0 && (await listOf(ana)).items.filter((i) => /Tu clase es hoy/.test(i.title)).length === 1]);

  // Paquete por vencer (el de la transferencia confirmada vence en 30 días: no avisa).
  const expiring = crypto.randomUUID();
  await db.insert(schema.studentPass).values({ id: expiring, organizationId: orgId, studentId: anaSt, name: 'Mensualidad vieja', seats: 1, creditsTotal: null, startsAt: new Date(Date.now() - 27 * 86400e3), expiresAt: new Date(Date.now() + 2 * 86400e3) });
  const r1 = await runReminders();
  const r2 = await runReminders();
  const exp = (await listOf(ana)).items.filter((i) => i.title === 'Tu paquete está por vencer');
  out.push(['Un paquete que vence en 2 días avisa una sola vez', r1.passes === 1 && r2.passes === 0 && exp.length === 1 && /2 días/.test(exp[0].body), `${r1.passes}/${r2.passes}`]);
  out.push(['El paquete de 30 días no avisa todavía', !exp.some((i) => /Paquete 4/.test(i.body))]);

  // Si apagó los recordatorios, no recibe más (y no se gasta la marca de otra clase).
  await call(ana, 'PUT', '/me/notification-prefs', { reminders: false, classChanges: true, payments: true, team: true });
  const soon2 = await session(30);
  await book(soon2, anaSt, 200);
  await runReminders();
  out.push(['Con recordatorios apagados no recibe el de otra clase', (await listOf(ana)).items.filter((i) => /Tu clase es hoy/.test(i.title)).length === 1]);

  // Sin CRON_SECRET configurado el trabajo no corre.
  delete process.env.CRON_SECRET;
  const none = await call(null, 'POST', '/jobs/reminders', undefined, { 'x-cron-secret': 'x' });
  out.push(['Sin secreto configurado el trabajo responde 503', none.status === 503, `${none.status}`]);

  // Dispositivos: el mismo teléfono cambia de cuenta.
  await call(bea, 'POST', '/me/push-token', { token: 'ExponentPushToken[ana-device-0001]', platform: 'ios' });
  const anaDev = (await call(ana, 'GET', '/me/notification-prefs')).json.devices;
  const beaDev = (await call(bea, 'GET', '/me/notification-prefs')).json.devices;
  out.push(['Un dispositivo solo pertenece a una cuenta (pasa a la última que lo usó)', anaDev === 0 && beaDev === 1, `${anaDev}/${beaDev}`]);
  await call(bea, 'DELETE', '/me/push-token', { token: 'ExponentPushToken[ana-device-0001]' });
  out.push(['Al cerrar sesión se puede quitar el dispositivo', (await call(bea, 'GET', '/me/notification-prefs')).json.devices === 0]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail && !ok ? ' — ' + detail : ''}`);
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
  if (userIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  fake.stop(true);
  process.exit(process.exitCode ?? 0);
}
