/**
 * Prueba de la lista de espera:
 *  - solo se entra a una sesión LLENA; no se repite ni entra quien ya reservó;
 *  - al liberarse un lugar se APARTA para el primero de la fila (y solo para él): nadie más puede reservarlo, ni recepción;
 *  - quien lo toma queda reservado; con cancelaciones simultáneas nunca se ofrece de más;
 *  - las ofertas vencen y pasan al siguiente; salir de la fila con un lugar apartado también lo pasa;
 *  - si la clase está muy cerca no se ofrece; el tiempo apartado nunca pasa de lo razonable;
 *  - ampliar el cupo ofrece lugares; cancelar la clase cierra la fila y avisa;
 *  - el equipo ve la fila y puede quitar a alguien, con permisos.
 *   bun --env-file=.env scripts/waitlist-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';
import { updateSession } from '../src/server/db/classes';
import { runWaitlistMaintenance } from '../src/server/db/waitlist';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-wl-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';
const MIN = 60_000;

try {
  const mk = async (label: string) => {
    const r = await api.handle(new Request('http://localhost/api/auth/sign-up/email', { method: 'POST', headers: H, body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }) }));
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    return { id, cookie };
  };
  const call = async (who: { cookie: string } | null, method: string, path: string, body?: unknown) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, ...(who ? { cookie: who.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const rene = await mk('rene');
  const ana = await mk('ana');
  const beto = await mk('beto');
  const cami = await mk('cami');
  const dani = await mk('dani');
  const eli = await mk('eli');
  const outsider = await mk('afuera');
  const org = await createOrganization(owner.id, { name: `ZZ Wl ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 30 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: rene.id, role: 'staff', createdAt: new Date() });
  const room = (await db.query.room.findFirst({ where: eq(schema.room.organizationId, orgId) }))!;
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ Salsa', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const session = async (minutesFromNow: number, capacity: number) => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({ id, organizationId: orgId, serviceId: svc, roomId: room.id, startsAt: new Date(Date.now() + minutesFromNow * MIN), endsAt: new Date(Date.now() + (minutesFromNow + 60) * MIN), capacity, status: 'SCHEDULED' });
    return id;
  };
  const book = (who: { cookie: string }, sid: string) => call(who, 'POST', `/discover/sessions/${sid}/book`);
  const join = (who: { cookie: string }, sid: string) => call(who, 'POST', `/discover/sessions/${sid}/waitlist`);
  const detail = async (who: { cookie: string }, sid: string) => (await call(who, 'GET', `/discover/sessions/${sid}`)).json;
  const entries = async (sid: string) => db.select().from(schema.waitlistEntry).where(eq(schema.waitlistEntry.sessionId, sid));
  const statusOf = async (sid: string, userId: string) => {
    const st = await db.query.student.findFirst({ where: eq(schema.student.userId, userId) });
    return (await entries(sid)).find((e) => e.studentId === st?.id && ['WAITING', 'OFFERED', 'BOOKED', 'EXPIRED', 'CANCELED'].includes(e.status))?.status;
  };
  const titles = async (userId: string) => (await db.select().from(schema.notification).where(eq(schema.notification.userId, userId))).map((n) => n.title);

  // ── Entrar a la fila ───────────────────────────────────────────────────────
  const S = await session(24 * 60, 2);
  const roomy = await session(26 * 60, 5);
  const notFull = await join(cami, roomy);
  out.push(['Con lugares libres no se entra a la fila (se reserva directo)', notFull.status === 409 && /reserva directo/.test(notFull.json.message), `${notFull.status}`]);
  const ba = await book(ana, S);
  await book(beto, S);
  out.push(['La sesión queda llena', ba.status === 200 && (await detail(cami, S)).left === 0]);
  const j1 = await join(cami, S);
  const j2 = await join(dani, S);
  const j3 = await join(eli, S);
  out.push(['Entran en orden: posiciones 1, 2 y 3', j1.json.position === 1 && j2.json.position === 2 && j3.json.position === 3, `${j1.json.position}${j2.json.position}${j3.json.position}`]);
  out.push(['No se repite', (await join(cami, S)).status === 409]);
  out.push(['Quien ya reservó no entra', (await join(ana, S)).status === 409]);
  out.push(['Sin sesión no se entra', (await call(null, 'POST', `/discover/sessions/${S}/waitlist`)).status === 401]);
  const d0 = await detail(dani, S);
  out.push(['El detalle muestra mi posición y cuántas esperan', d0.waitlist.status === 'WAITING' && d0.waitlist.position === 2 && d0.waitlist.count === 3]);

  // ── Se libera un lugar ─────────────────────────────────────────────────────
  const anaBooking = (await call(ana, 'GET', '/me/bookings?scope=upcoming')).json[0].id;
  const cancel = await call(ana, 'POST', `/me/bookings/${anaBooking}/cancel`);
  out.push(['Al cancelar, el primero de la fila recibe el lugar apartado', cancel.status === 200 && (await statusOf(S, cami.id)) === 'OFFERED' && (await statusOf(S, dani.id)) === 'WAITING']);
  out.push(['…y se le avisa', (await titles(cami.id)).includes('Se liberó un lugar') && !(await titles(dani.id)).includes('Se liberó un lugar')]);
  const dCami = await detail(cami, S);
  const dDani = await detail(dani, S);
  out.push(['Para quien lo tiene apartado hay 1 lugar; para los demás, ninguno', dCami.left === 1 && dCami.waitlist.status === 'OFFERED' && !!dCami.waitlist.offerExpiresAt && dDani.left === 0, `${dCami.left}/${dDani.left}`]);
  const list = (await call(eli, 'GET', '/discover/sessions')).json.find((x: any) => x.id === S);
  out.push(['En Descubrir la sesión sigue llena para el resto', list.left === 0]);
  const eliTry = await book(eli, S);
  out.push(['Otra persona de la fila no puede reservar el lugar apartado', eliTry.status === 409 && (await statusOf(S, eli.id)) === 'WAITING', `${eliTry.status}`]);
  const daniTry = await book(dani, S);
  out.push(['…ni quien sigue después', daniTry.status === 409]);
  const outTry = await book(outsider, S);
  out.push(['…ni alguien ajeno a la fila', outTry.status === 409]);
  const cs = (await db.query.student.findFirst({ where: eq(schema.student.userId, cami.id) }))!;
  const staffTry = await call(rene, 'POST', `/orgs/${orgId}/sessions/${S}/bookings`, { studentId: (await db.insert(schema.student).values({ organizationId: orgId, name: 'Sin cuenta' }).returning())[0].id });
  out.push(['…ni recepción', staffTry.status === 409, `${staffTry.status}`]);

  const take = await book(cami, S);
  out.push(['Quien lo tiene apartado lo toma', take.status === 200 && (await statusOf(S, cami.id)) === 'BOOKED']);
  void cs;

  // ── Cancelaciones simultáneas ──────────────────────────────────────────────
  const C = await session(30 * 60, 3);
  const trio = [await mk('t1'), await mk('t2'), await mk('t3')];
  for (const u of trio) await book(u, C);
  const queue = [await mk('q1'), await mk('q2'), await mk('q3'), await mk('q4'), await mk('q5'), await mk('q6')];
  for (const u of queue) await join(u, C);
  const bookingIds = await Promise.all(trio.map(async (u) => (await call(u, 'GET', '/me/bookings?scope=upcoming')).json[0].id as string));
  await Promise.all(trio.map((u, i) => call(u, 'POST', `/me/bookings/${bookingIds[i]}/cancel`)));
  const offeredNow = (await entries(C)).filter((e) => e.status === 'OFFERED');
  const firstThree = (await entries(C)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).slice(0, 3).map((e) => e.id);
  out.push(['Con 3 cancelaciones a la vez se ofrecen exactamente 3 lugares, a los 3 primeros', offeredNow.length === 3 && offeredNow.every((e) => firstThree.includes(e.id)), `${offeredNow.length}`]);

  // ── Vencimiento y salida ───────────────────────────────────────────────────
  const E = await session(20 * 60, 1);
  const holder = await mk('holder');
  await book(holder, E);
  const w1 = await mk('w1');
  const w2 = await mk('w2');
  const w3 = await mk('w3');
  for (const u of [w1, w2, w3]) await join(u, E);
  const hb = (await call(holder, 'GET', '/me/bookings?scope=upcoming')).json[0].id;
  await call(holder, 'POST', `/me/bookings/${hb}/cancel`);
  const offered = (await entries(E)).find((e) => e.status === 'OFFERED')!;
  out.push(['La oferta dura como máximo 2 horas', offered.offerExpiresAt!.getTime() - offered.offeredAt!.getTime() <= 2 * 60 * MIN + 1000, `${(offered.offerExpiresAt!.getTime() - offered.offeredAt!.getTime()) / MIN} min`]);
  const m1 = await runWaitlistMaintenance(Date.now() + 3 * 60 * MIN);
  out.push(['Al vencer la oferta pasa al siguiente', (await statusOf(E, w1.id)) === 'EXPIRED' && (await statusOf(E, w2.id)) === 'OFFERED' && m1.offered >= 1]);
  out.push(['…y a quien se le venció se le avisa', (await titles(w1.id)).includes('Se venció tu lugar')]);
  const leave = await call(w2, 'DELETE', `/discover/sessions/${E}/waitlist`);
  out.push(['Rechazar el lugar apartado lo pasa al siguiente', leave.status === 200 && (await statusOf(E, w2.id)) === 'CANCELED' && (await statusOf(E, w3.id)) === 'OFFERED']);
  out.push(['Salir de una fila en la que no estoy da 404', (await call(w2, 'DELETE', `/discover/sessions/${E}/waitlist`)).status === 404]);

  // ── Clase muy cerca ────────────────────────────────────────────────────────
  const near = await session(40, 1);
  const nb = await mk('nb');
  await book(nb, near);
  const nw = await mk('nw');
  await join(nw, near);
  // Con la clase tan cerca la persona ya no puede cancelar (ventana de cancelación): cancela recepción.
  const nbk = (await call(nb, 'GET', '/me/bookings?scope=upcoming')).json[0].id;
  out.push(['(la persona ya no puede cancelar tan cerca de la clase)', (await call(nb, 'POST', `/me/bookings/${nbk}/cancel`)).status === 409]);
  await call(rene, 'POST', `/orgs/${orgId}/bookings/${nbk}/cancel`);
  const nearOffer = (await entries(near))[0];
  out.push(['Con la clase en 40 min el lugar se aparta menos de 40 min', nearOffer.status === 'OFFERED' && nearOffer.offerExpiresAt!.getTime() - Date.now() <= 31 * MIN, `${nearOffer.status}`]);
  const tooNear = await session(15, 1);
  const tb = await mk('tb');
  await book(tb, tooNear);
  const tw = await mk('tw');
  await join(tw, tooNear);
  const tbk = (await call(tb, 'GET', '/me/bookings?scope=upcoming')).json[0].id;
  await call(rene, 'POST', `/orgs/${orgId}/bookings/${tbk}/cancel`);
  out.push(['Con la clase en 15 min ya no se ofrece (no da tiempo)', (await statusOf(tooNear, tw.id)) === 'WAITING']);

  // ── Ampliar el cupo y cancelar la clase ────────────────────────────────────
  const G = await session(50 * 60, 1);
  const g1 = await mk('g1');
  await book(g1, G);
  const g2 = await mk('g2');
  await join(g2, G);
  const up = await updateSession(owner.id, orgId, G, { capacity: 2, roomId: room.id });
  out.push(['Ampliar el cupo ofrece el lugar nuevo', 'ok' in up && (await statusOf(G, g2.id)) === 'OFFERED']);
  const g3 = await mk('g3');
  out.push(['…y ese lugar nuevo ya no se puede tomar por otra persona', (await book(g3, G)).status === 409]);
  const cancelClass = await call(owner, 'POST', `/orgs/${orgId}/sessions/${G}/cancel`, { scope: 'one' });
  out.push(['Cancelar la clase cierra la fila y avisa', cancelClass.status === 200 && (await statusOf(G, g2.id)) === 'CANCELED' && (await titles(g2.id)).some((t) => /canceló la clase/.test(t))]);

  // ── Equipo y mis listas ────────────────────────────────────────────────────
  const view = await call(rene, 'GET', `/orgs/${orgId}/sessions/${C}/waitlist`);
  out.push(['El equipo ve la fila en orden con quién tiene el lugar apartado', view.status === 200 && view.json.length === 3 && view.json[0].position === 1 && view.json.every((x: any) => x.status === 'OFFERED' && !!x.offerExpiresAt)]);
  out.push(['Quien no es del equipo no la ve', (await call(outsider, 'GET', `/orgs/${orgId}/sessions/${C}/waitlist`)).status === 404]);
  const rm = await call(rene, 'DELETE', `/orgs/${orgId}/waitlist/${view.json[0].id}`);
  const after = (await call(rene, 'GET', `/orgs/${orgId}/sessions/${C}/waitlist`)).json;
  out.push(['Recepción quita a alguien de la fila', rm.status === 200 && after.length === 2 && after[0].position === 1]);
  const mine = (await call(queue[4], 'GET', '/me/waitlist')).json;
  out.push(['Mi lista muestra mi posición y la clase', mine.length === 1 && mine[0].service === 'ZZ Salsa' && typeof mine[0].position === 'number']);

  // Filas de clases que ya empezaron se cierran.
  const P = await session(-30, 1);
  const pw = await mk('pw');
  const pst = crypto.randomUUID();
  await db.insert(schema.student).values({ id: pst, organizationId: orgId, userId: pw.id, name: 'Pw' });
  await db.insert(schema.waitlistEntry).values({ organizationId: orgId, sessionId: P, studentId: pst });
  await runWaitlistMaintenance();
  out.push(['La fila de una clase que ya empezó se cierra', (await entries(P))[0].status === 'EXPIRED']);

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
  process.exit(process.exitCode ?? 0);
}
