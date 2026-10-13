/**
 * Prueba del aviso de llegada del alumno: solo dentro de la ventana, solo el dueño de la reserva, idempotente,
 * no cuenta como asistencia por sí solo y al cerrar la lista cuenta como presente (el resto sin marcar, como falta).
 * Después de la clase es un «sí asistí» (hasta 7 días): la academia lo confirma, nunca se confirma solo.
 *   bun --env-file=.env scripts/checkin-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { closeAttendance, getAttendance } from '../src/server/db/attendance';
import { bookAsUser, checkInBooking } from '../src/server/db/bookings';
import { createService } from '../src/server/db/classes';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';
import { addDays, localDate } from '../src/server/lib/time';

const tag = `zz-chk-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const tz = 'America/Mexico_City';

try {
  const mk = async (label: string) => {
    const r = await auth.api.signUpEmail({ body: { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` } });
    ids.push(r.user.id);
    return r.user;
  };
  const owner = await mk('owner');
  const a = await mk('alumno-a');
  const b = await mk('alumno-b');
  const c = await mk('alumno-c');
  const org = await createOrganization(owner.id, {
    name: `ZZ Chk ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 20,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true, verificationStatus: 'APPROVED' }).where(eq(schema.organizationDetail.organizationId, orgId));
  const room = (await db.select().from(schema.room).where(eq(schema.room.organizationId, orgId)))[0];
  const day = addDays(localDate(Date.now(), tz), 3);
  const created = await createService(owner.id, orgId, { name: 'ZZ Clase', kind: 'GROUP', priceCents: 0, durationMin: 60 }, {
    roomId: room.id,
    instructorUserId: owner.id,
    startTime: '19:00',
    startDate: day,
    endDate: day,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  } as never);
  if ('error' in created) throw new Error(JSON.stringify(created));
  const session = (await db.select().from(schema.classSession).where(eq(schema.classSession.organizationId, orgId)))[0];
  const setTimes = (startOffsetMin: number, durMin = 60) =>
    db
      .update(schema.classSession)
      .set({ startsAt: new Date(Date.now() + startOffsetMin * 60_000), endsAt: new Date(Date.now() + (startOffsetMin + durMin) * 60_000) })
      .where(eq(schema.classSession.id, session.id));

  const book = async (u: typeof a) => {
    const r = (await bookAsUser(u as never, session.id)) as { id?: string; error?: string };
    if (!r.id) throw new Error(`no reservó: ${r.error}`);
    return r.id;
  };
  const ba = await book(a);
  const bb = await book(b);
  const bc = await book(c);

  const err = (r: unknown) => ('error' in (r as object) ? (r as { error: string }).error : null);

  out.push(['Muy temprano (2 h antes) se rechaza', err(await checkInBooking(a.id, ba)) === 'TOO_EARLY']);
  await setTimes(20); // empieza en 20 min: dentro de la ventana de 30
  out.push(['Dentro de la ventana se acepta', err(await checkInBooking(a.id, ba)) === null]);
  const again = await checkInBooking(a.id, ba);
  out.push(['Repetirlo es idempotente', err(again) === null]);
  out.push(['Otra persona no puede avisar por la reserva ajena', err(await checkInBooking(b.id, ba)) === 'NOT_FOUND']);
  out.push(['Una reserva inexistente da NOT_FOUND', err(await checkInBooking(a.id, 'no-existe')) === 'NOT_FOUND']);

  const att1 = await getAttendance(orgId, session.id);
  const rowA = att1?.students.find((s) => s.bookingId === ba);
  out.push(['La lista de la academia ve el aviso, sin asistencia aún', !!rowA?.checkedInAt && rowA.status === null]);

  // La clase ya terminó (empezó hace 90 min y duró 60). El aviso de A cae dentro de la clase.
  await setTimes(-90, 60);
  await db.update(schema.booking).set({ checkedInAt: new Date(Date.now() - 80 * 60_000) }).where(eq(schema.booking.id, ba));

  // «Sí asistí»: después de terminar se acepta (B), aunque la lista siga abierta.
  out.push(['Después de terminar se acepta como «sí asistí»', err(await checkInBooking(b.id, bb)) === null]);

  // Al cerrar: A (avisó durante la clase) queda presente; B (reclamó después) y C quedan como falta hasta que la academia confirme.
  const closed = (await closeAttendance({ userId: owner.id, role: 'owner' }, orgId, session.id)) as { autoPresent?: number; autoAbsent?: number };
  out.push(['Al cerrar: solo el aviso durante la clase queda presente', closed.autoPresent === 1 && closed.autoAbsent === 2, JSON.stringify(closed)]);
  const att2 = await getAttendance(orgId, session.id);
  const st = (id: string) => att2?.students.find((s) => s.bookingId === id)?.status;
  out.push(['A presente; B (reclamo) y C falta', st(ba) === 'PRESENT' && st(bb) === 'ABSENT' && st(bc) === 'ABSENT']);

  // Con la lista cerrada y la clase terminada, C todavía puede decir «sí asistí».
  out.push(['Con la lista cerrada se puede reclamar si ya terminó', err(await checkInBooking(c.id, bc)) === null]);
  out.push(['Quien ya está presente: repetir no falla', err(await checkInBooking(a.id, ba)) === null]);

  // Durante la clase, con la lista cerrada, no.
  await setTimes(-10, 60);
  await db.update(schema.booking).set({ checkedInAt: null }).where(eq(schema.booking.id, bc));
  await db.delete(schema.attendance).where(eq(schema.attendance.bookingId, bc));
  out.push(['En plena clase con la lista cerrada se rechaza', err(await checkInBooking(c.id, bc)) === 'CLOSED']);

  // Pasados 7 días ya no.
  await setTimes(-(8 * 24 * 60 + 60), 60);
  out.push(['A los 8 días ya no se puede', err(await checkInBooking(c.id, bc)) === 'ENDED']);

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
