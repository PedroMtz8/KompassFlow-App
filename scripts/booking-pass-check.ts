/**
 * Prueba del aviso de paquete al reservar y de «Para ti» en Descubrir:
 *  - `passForSession` dice qué paquete cubriría la clase (sin consumir nada) y cuántos créditos ya están apartados;
 *  - ignora paquetes vencidos, agotados o que aún no empiezan; el ilimitado no se agota;
 *  - `discoverSessions` marca `forYou` solo en las disciplinas que la persona eligió.
 *   bun --env-file=.env scripts/booking-pass-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { bookSession, discoverSessions, ensureStudentForUser } from '../src/server/db/bookings';
import { createOrganization } from '../src/server/db/organizations';
import { createProduct, passForSession, registerPayment } from '../src/server/db/payments';

const tag = `zz-bpa-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';

try {
  const mk = async (label: string) => {
    const r = await auth.api.signUpEmail({ body: { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` } });
    ids.push(r.user.id);
    return { id: r.user.id, name: `ZZ ${label}`, email: `${tag}-${label}@example.com` };
  };
  const owner = await mk('owner');
  const ana = await mk('ana');
  const o = await createOrganization(owner.id, { name: `ZZ Bpa ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in o) throw new Error(o.error);
  orgId = (o as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));

  const disciplines = await db.select({ id: schema.discipline.id }).from(schema.discipline).limit(2);
  if (disciplines.length < 2) throw new Error('El catálogo necesita al menos 2 disciplinas (corre el seed).');
  const [dA, dB] = disciplines.map((d) => d.id);
  const mkService = async (name: string, disciplineId: string) => {
    const id = crypto.randomUUID();
    await db.insert(schema.service).values({ id, organizationId: orgId, name, kind: 'GROUP', priceCents: 15000, durationMin: 60, disciplineId });
    return id;
  };
  const svcA = await mkService('ZZ Clase A', dA);
  const svcB = await mkService('ZZ Clase B', dB);
  const mkSession = async (serviceId: string, hoursAhead: number) => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id,
      organizationId: orgId,
      serviceId,
      startsAt: new Date(Date.now() + hoursAhead * 3600e3),
      endsAt: new Date(Date.now() + (hoursAhead + 1) * 3600e3),
      capacity: 10,
      status: 'SCHEDULED',
    });
    return id;
  };
  const s1 = await mkSession(svcA, 24);
  const s2 = await mkSession(svcA, 48);
  const s3 = await mkSession(svcB, 30);

  // ── Sin paquete ────────────────────────────────────────────────────────────
  out.push(['Sin registro de alumno no hay paquete', (await passForSession(ana.id, orgId, new Date(Date.now() + 86400e3))) === null]);
  const studentId = await ensureStudentForUser(orgId, ana);
  out.push(['Con registro pero sin paquete tampoco', (await passForSession(ana.id, orgId, new Date(Date.now() + 86400e3))) === null]);

  // ── Paquete de 2 créditos ──────────────────────────────────────────────────
  const pack = (await createProduct(owner.id, orgId, { name: 'Paquete 2', kind: 'PACKAGE', priceCents: 30000, credits: 2, validityDays: 30 })) as { id: string };
  await registerPayment(owner.id, orgId, { studentId, productId: pack.id, method: 'CASH' });
  let n = await passForSession(ana.id, orgId, new Date(Date.now() + 24 * 3600e3));
  out.push(['Un paquete vigente cubre la clase', n?.name === 'Paquete 2' && n.remaining === 2 && n.reserved === 0, JSON.stringify(n)]);
  out.push(['Reservar no consume créditos', (await bookSession({ organizationId: orgId, sessionId: s1, studentId, source: 'STAFF', actorId: owner.id }), (await passForSession(ana.id, orgId, new Date(Date.now() + 48 * 3600e3)))?.remaining === 2)]);
  n = await passForSession(ana.id, orgId, new Date(Date.now() + 48 * 3600e3));
  out.push(['Las otras reservas futuras quedan apartadas', n?.reserved === 1, JSON.stringify(n)]);
  out.push(['Fuera de la vigencia del paquete no cubre', (await passForSession(ana.id, orgId, new Date(Date.now() + 40 * 86400e3))) === null]);

  // Al agotar los créditos (asistencias) ya no cubre.
  for (const sid of [s1, s2]) {
    const bid = crypto.randomUUID();
    if (sid === s2) await db.insert(schema.booking).values({ id: bid, organizationId: orgId, sessionId: sid, studentId, status: 'CONFIRMED', source: 'STAFF' });
    const b = await db.query.booking.findFirst({ where: (t, { and, eq: e }) => and(e(t.sessionId, sid), e(t.studentId, studentId)) });
    await db.insert(schema.attendance).values({ organizationId: orgId, sessionId: sid, bookingId: b!.id, studentId, status: 'PRESENT' });
  }
  // Las asistencias son de clases futuras, así que se reparten por su fecha; ambas caen dentro de la vigencia.
  out.push(['Paquete agotado por asistencias ya no cubre', (await passForSession(ana.id, orgId, new Date(Date.now() + 72 * 3600e3))) === null]);

  // ── Ilimitado ──────────────────────────────────────────────────────────────
  const unl = (await createProduct(owner.id, orgId, { name: 'Mensualidad', kind: 'MEMBERSHIP', priceCents: 70000, validityDays: 30 })) as { id: string };
  await registerPayment(owner.id, orgId, { studentId, productId: unl.id, method: 'CASH' });
  n = await passForSession(ana.id, orgId, new Date(Date.now() + 72 * 3600e3));
  out.push(['La mensualidad ilimitada cubre sin contar créditos', n?.name === 'Mensualidad' && n.remaining === null, JSON.stringify(n)]);

  // ── Para ti ────────────────────────────────────────────────────────────────
  const before = (await discoverSessions(ana.id)).filter((s) => s.organizationId === orgId);
  out.push(['Sin intereses ninguna clase es «Para ti»', before.length >= 2 && before.every((s) => !s.forYou)]);
  await db.insert(schema.userInterest).values({ userId: ana.id, disciplineId: dA });
  const after = (await discoverSessions(ana.id)).filter((s) => s.organizationId === orgId);
  const byId = new Map(after.map((s) => [s.id, s.forYou]));
  out.push(['Con interés en A, las clases de A son «Para ti»', byId.get(s1) === true && byId.get(s2) === true]);
  out.push(['Las de otra disciplina no', byId.get(s3) === false]);

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
  process.exit(process.exitCode ?? 0);
}
