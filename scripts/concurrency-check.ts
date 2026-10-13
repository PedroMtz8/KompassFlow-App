/**
 * Pruebas de concurrencia de las operaciones que no pueden fallar bajo carga (PRD §18 reglas 3 y 7):
 *  - cupo: N personas reservan a la vez una sesión con cupo C => exactamente C reservas;
 *  - la misma persona no puede reservar dos veces la misma sesión;
 *  - privadas: varias personas piden el mismo horario => una sola entra;
 *  - código de vinculación: canjes simultáneos => uno solo gana y el alumno queda con una sola cuenta;
 *  - pase de lista: marcas simultáneas sobre una reserva => una sola fila de asistencia.
 *
 * Habla directo con la base (no necesita el servidor). Crea datos temporales y los borra al terminar:
 *   bun --env-file=.env scripts/concurrency-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { markAttendance } from '../src/server/db/attendance';
import { bookAsUser, bookSession, ensureStudentForUser } from '../src/server/db/bookings';
import { createOrganization } from '../src/server/db/organizations';
import { bookPrivateSlot, listSlots, setAvailability } from '../src/server/db/privates';
import { createLinkCode, redeemLinkCode } from '../src/server/db/student-link';
import { allow } from '../src/server/lib/rate-limit';

const tag = `zz-conc-${Date.now()}`;
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

const mkUser = async (label: string) => {
  const email = `${tag}-${label}@example.com`;
  const r = await auth.api.signUpEmail({ body: { email, password: 'clave-segura-123', name: `ZZ ${label}` } });
  return { id: r.user.id, name: `ZZ ${label}`, email };
};

const userIds: string[] = [];
let orgId = '';
try {
  const owner = await mkUser('owner');
  userIds.push(owner.id);
  const org = await createOrganization(owner.id, {
    name: `ZZ Conc ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 50,
  } as never);
  if ('error' in org) throw new Error(`crear org: ${org.error}`);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));
  const room = (await db.select().from(schema.room).where(eq(schema.room.organizationId, orgId)))[0];

  const svcId = crypto.randomUUID();
  await db
    .insert(schema.service)
    .values({ id: svcId, organizationId: orgId, name: 'ZZ Clase', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const session = async (capacity: number, hoursAhead = 48) => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id,
      organizationId: orgId,
      serviceId: svcId,
      roomId: room.id,
      instructorUserId: owner.id,
      startsAt: new Date(Date.now() + hoursAhead * 3600e3),
      endsAt: new Date(Date.now() + (hoursAhead + 1) * 3600e3),
      capacity,
      status: 'SCHEDULED',
    });
    return id;
  };

  // 1) Cupo.
  const users = await Promise.all(Array.from({ length: 12 }, (_, i) => mkUser(`u${i}`)));
  userIds.push(...users.map((u) => u.id));
  const s1 = await session(5);
  const r1 = await Promise.all(users.map((u) => bookAsUser(u, s1)));
  const ok1 = r1.filter((r) => 'id' in r).length;
  const confirmed = (await db.select().from(schema.booking).where(eq(schema.booking.sessionId, s1))).filter(
    (b) => b.status === 'CONFIRMED'
  ).length;
  check('Cupo: 12 personas, 5 lugares', ok1 === 5 && confirmed === 5, `aceptadas=${ok1}, confirmadas en BD=${confirmed}`);

  // 2) Misma persona, misma sesión.
  const s2 = await session(10);
  const studentId = await ensureStudentForUser(orgId, users[0]);
  const r2 = await Promise.all(
    Array.from({ length: 6 }, () =>
      bookSession({ organizationId: orgId, sessionId: s2, studentId, source: 'STUDENT', actorId: users[0].id })
    )
  );
  const ok2 = r2.filter((r) => 'id' in r).length;
  check('Doble reserva de la misma persona', ok2 === 1, `aceptadas=${ok2} de 6`);

  // 3) Privadas: mismo horario.
  const privId = crypto.randomUUID();
  await db.insert(schema.service).values({
    id: privId,
    organizationId: orgId,
    name: 'ZZ Privada',
    kind: 'PRIVATE',
    priceCents: 0,
    durationMin: 60,
    bufferMin: 15,
    instructorUserId: owner.id,
  });
  await setAvailability(
    owner.id,
    orgId,
    owner.id,
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '00:00', endTime: '23:59' }))
  );
  const slots = await listSlots(privId);
  const slot = slots?.days.find((d) => d.slots.length > 2)?.slots[1];
  if (!slot) throw new Error('sin horarios para la prueba de privadas');
  const r3 = await Promise.all(users.slice(0, 8).map((u) => bookPrivateSlot(u, privId, slot)));
  const ok3 = r3.filter((r) => 'bookingId' in r).length;
  const sessions3 = (await db.select().from(schema.classSession).where(eq(schema.classSession.serviceId, privId))).length;
  check('Privada: 8 personas, 1 horario', ok3 === 1 && sessions3 === 1, `aceptadas=${ok3}, sesiones creadas=${sessions3}`);

  // 4) Código de vinculación.
  const guest = crypto.randomUUID();
  await db.insert(schema.student).values({ id: guest, organizationId: orgId, name: 'ZZ Invitado' });
  const code = (await createLinkCode(owner.id, orgId, guest)) as { code: string };
  const r4 = await Promise.all(users.slice(6, 12).map((u) => redeemLinkCode(u, code.code)));
  const ok4 = r4.filter((r) => 'ok' in r).length;
  const linked = (await db.select().from(schema.student).where(eq(schema.student.id, guest)))[0];
  // Si la persona ya tenía registro propio en la academia, el invitado se fusiona con él (y desaparece).
  check(
    'Código de vinculación: 6 canjes simultáneos',
    ok4 === 1 && (!linked || !!linked.userId),
    `canjes válidos=${ok4}, invitado ${linked ? 'vinculado' : 'fusionado'}`
  );

  // 5) Pase de lista: marcas simultáneas.
  const booking = (await db.select().from(schema.booking).where(eq(schema.booking.sessionId, s2)))[0];
  await db
    .update(schema.classSession)
    .set({ startsAt: new Date(Date.now() + 10 * 60e3), endsAt: new Date(Date.now() + 70 * 60e3) })
    .where(eq(schema.classSession.id, s2));
  const actor = { userId: owner.id, role: 'owner' };
  await Promise.all(
    ['PRESENT', 'ABSENT', 'PRESENT', 'ABSENT', 'PRESENT'].map((st) =>
      markAttendance(actor, orgId, s2, booking.id, st as 'PRESENT' | 'ABSENT')
    )
  );
  const rows = await db.select().from(schema.attendance).where(eq(schema.attendance.bookingId, booking.id));
  check('Asistencia: 5 marcas simultáneas', rows.length === 1, `filas=${rows.length}, estado final=${rows[0]?.status}`);

  // 6) Límite de intentos.
  const key = `${tag}:rl`;
  const hits = (await Promise.all(Array.from({ length: 8 }, () => allow(key, 5, 60_000)))).filter(Boolean).length;
  check('Límite de intentos: 5 por ventana', hits === 5, `permitidos=${hits} de 8`);
  check('Límite de intentos: la ventana se libera', await allow(key, 5, 60_000, Date.now() + 61_000), 'tras 61 s vuelve a permitir');

  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.name} — ${r.detail}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
  else console.log('\nTodas las pruebas de concurrencia pasaron.');
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
