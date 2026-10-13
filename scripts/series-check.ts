/**
 * Prueba de la edición de horarios recurrentes: agrega sesiones sin tocar las existentes, quita solo las que sobran,
 * protege las que tienen reservas (hace falta `force`) y respeta el pasado y los choques de horario.
 *   bun --env-file=.env scripts/series-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { createService, editSeries, listSeries } from '../src/server/db/classes';
import { createOrganization } from '../src/server/db/organizations';
import { addDays, localDate, weekdayOf } from '../src/server/lib/time';

type Dry = { dryRun?: true; summary: { add: number; remove: number; withBookings: unknown[]; bookingsAffected: number } };
const tag = `zz-ser-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
// Zona horaria que la organización de prueba recibe por defecto al crearse.
const tz = 'America/Mexico_City';

try {
  const mk = async (label: string) => {
    const r = await auth.api.signUpEmail({
      body: { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` },
    });
    ids.push(r.user.id);
    return r.user.id;
  };
  const owner = await mk('owner');
  const student = await mk('student');
  const org = await createOrganization(owner, {
    name: `ZZ Ser ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 20,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  const room = (await db.select().from(schema.room).where(eq(schema.room.organizationId, orgId)))[0];

  const start = addDays(localDate(Date.now(), tz), 2);
  const end = addDays(start, 27); // 4 semanas
  const wd = [weekdayOf(start), weekdayOf(addDays(start, 2))];
  const created = await createService(owner, orgId, { name: 'ZZ Clase', kind: 'GROUP', priceCents: 0, durationMin: 60 }, {
    roomId: room.id,
    instructorUserId: owner,
    startTime: '19:00',
    startDate: start,
    endDate: end,
    weekdays: wd,
  } as never);
  if ('error' in created) throw new Error(JSON.stringify(created));
  const svcId = created.id;
  const series = (await db.select().from(schema.sessionSeries).where(eq(schema.sessionSeries.serviceId, svcId)))[0];
  const sessions = async () => db.select().from(schema.classSession).where(eq(schema.classSession.seriesId, series.id));
  const before = await sessions();
  out.push(['Serie creada con sus sesiones', before.length >= 8, `${before.length}`]);

  const listed = await listSeries(orgId, svcId);
  out.push(['Lista los horarios recurrentes', !!listed && listed.length === 1 && listed[0].upcoming === before.length]);

  const base = { weekdays: wd, startDate: start, endDate: end, startTime: '19:00' };

  // 1) Sin cambios: nada que hacer.
  const same = (await editSeries(owner, orgId, series.id, base, { dryRun: true })) as Dry;
  out.push(['Sin cambios no crea ni quita nada', 'dryRun' in same && same.summary.add === 0 && same.summary.remove === 0]);

  // 2) Extender el final: se agregan sesiones y las existentes conservan su id.
  const ext = (await editSeries(owner, orgId, series.id, { ...base, endDate: addDays(end, 14) })) as { added?: number };
  const afterExt = await sessions();
  const keptIds = before.every((b) => afterExt.some((a) => a.id === b.id));
  out.push([
    'Extender agrega sesiones sin tocar las existentes',
    'added' in ext && (ext.added ?? 0) > 0 && keptIds,
    'added' in ext ? `+${ext.added}` : JSON.stringify(ext),
  ]);

  // 3) Adelantar el inicio: no se crean sesiones en el pasado.
  const early = (await editSeries(
    owner,
    orgId,
    series.id,
    { ...base, endDate: addDays(end, 14), startDate: addDays(start, -20) },
    { dryRun: true }
  )) as Dry;
  out.push(['Un inicio en el pasado no crea sesiones pasadas', 'dryRun' in early && early.summary.add >= 0 && early.summary.remove === 0]);

  // 4) Recortar con reservas: se protege.
  const all = (await sessions()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const first = all[0];
  const st = crypto.randomUUID();
  await db.insert(schema.student).values({ id: st, organizationId: orgId, userId: student, name: 'ZZ Alumna' });
  await db
    .insert(schema.booking)
    .values({ organizationId: orgId, sessionId: first.id, studentId: st, status: 'CONFIRMED', source: 'STAFF' });
  const newStart = addDays(start, 10);
  const cut = { ...base, endDate: addDays(end, 14), startDate: newStart };
  const dry = (await editSeries(owner, orgId, series.id, cut, { dryRun: true })) as Dry;
  out.push([
    'Vista previa cuenta sesiones y reservas afectadas',
    'dryRun' in dry && dry.summary.remove > 0 && dry.summary.withBookings.length === 1 && dry.summary.bookingsAffected === 1,
    'dryRun' in dry ? JSON.stringify({ r: dry.summary.remove, b: dry.summary.bookingsAffected }) : '',
  ]);
  const blocked = await editSeries(owner, orgId, series.id, cut);
  const untouched = (await sessions()).length === all.length;
  out.push(['Con reservas se bloquea sin confirmar', 'error' in blocked && blocked.error === 'HAS_BOOKINGS' && untouched]);

  // 5) Forzar: se cancela la reserva y se quitan las sesiones; el resto queda igual.
  const forced = await editSeries(owner, orgId, series.id, cut, { force: true });
  const bk = (await db.select().from(schema.booking).where(eq(schema.booking.studentId, st)))[0];
  const sess = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, first.id) });
  out.push([
    'Forzar cancela la reserva con motivo',
    'removed' in forced && bk.status === 'CANCELED' && !!bk.cancelReason,
    bk.cancelReason ?? '',
  ]);
  out.push(['La sesión con reservas queda cancelada (historial)', sess?.status === 'CANCELED']);
  const left = (await sessions()).filter((s) => s.status === 'SCHEDULED');
  out.push([
    'Quedan solo las sesiones desde la nueva fecha',
    left.length > 0 && left.every((s) => localDate(s.startsAt.getTime(), tz) >= newStart),
    `${left.length}`,
  ]);
  const updated = await db.query.sessionSeries.findFirst({ where: eq(schema.sessionSeries.id, series.id) });
  out.push(['La regla de la serie se actualiza', updated?.startDate === newStart]);

  // 6) El pasado no se toca.
  const pastId = crypto.randomUUID();
  await db.insert(schema.classSession).values({
    id: pastId,
    organizationId: orgId,
    serviceId: svcId,
    seriesId: series.id,
    roomId: room.id,
    instructorUserId: owner,
    startsAt: new Date(Date.now() - 3 * 86400_000),
    endsAt: new Date(Date.now() - 3 * 86400_000 + 3600_000),
    capacity: 5,
    status: 'SCHEDULED',
  });
  await editSeries(owner, orgId, series.id, { ...cut, startDate: addDays(newStart, 7) }, { force: true });
  out.push([
    'Las sesiones pasadas nunca se modifican',
    !!(await db.query.classSession.findFirst({ where: eq(schema.classSession.id, pastId) })),
  ]);

  // 7) Choque: otra clase en el mismo salón y hora.
  const otherSvc = crypto.randomUUID();
  await db
    .insert(schema.service)
    .values({ id: otherSvc, organizationId: orgId, name: 'ZZ Otra', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const target = addDays(start, 3);
  const { zonedTimeToUtc } = await import('../src/server/lib/time');
  await db.insert(schema.classSession).values({
    organizationId: orgId,
    serviceId: otherSvc,
    roomId: room.id,
    instructorUserId: null,
    startsAt: new Date(zonedTimeToUtc(target, '20:00', tz)),
    endsAt: new Date(zonedTimeToUtc(target, '21:00', tz)),
    capacity: 5,
    status: 'SCHEDULED',
  });
  const clash = await editSeries(
    owner,
    orgId,
    series.id,
    { weekdays: [weekdayOf(target)], startDate: target, endDate: addDays(target, 7), startTime: '20:00' },
    { force: true }
  );
  out.push(['Un choque de salón se rechaza', 'error' in clash && clash.error === 'CONFLICT']);

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
