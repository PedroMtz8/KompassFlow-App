import { and, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { userCan } from '../auth/access';
import { localDate, weekdayOf } from '../lib/time';
import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Minutos antes del inicio desde los que se puede pasar lista (no se pre-marca con días de anticipación). */
export const MARK_WINDOW_MIN = 60;

export type AttendanceStatus = 'PRESENT' | 'ABSENT';

type Actor = { userId: string; role: string };
export type AttendanceFail = 'NOT_FOUND' | 'CANCELED' | 'TOO_EARLY' | 'NOT_YOUR_SESSION';

/** Verifica que la sesión sea de la organización y que esta persona pueda pasar lista ahora. */
async function sessionForMarking(organizationId: string, sessionId: string, actor: Actor) {
  const s = await db.query.classSession.findFirst({
    where: and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId)),
  });
  if (!s) return { error: 'NOT_FOUND' as const };
  if (s.status === 'CANCELED') return { error: 'CANCELED' as const };
  // Solo quien tiene `attendance:update_any` pasa lista en cualquier sesión; los demás (p. ej. un instructor) solo en las que imparten.
  if (s.instructorUserId !== actor.userId && !(await userCan(organizationId, actor.userId, 'attendance', 'update_any')))
    return { error: 'NOT_YOUR_SESSION' as const };
  if (s.startsAt.getTime() - MARK_WINDOW_MIN * 60_000 > Date.now()) return { error: 'TOO_EARLY' as const };
  return { session: s };
}

/** Lista de la sesión: cada reserva confirmada con su asistencia (si ya se marcó). */
export async function getAttendance(organizationId: string, sessionId: string, actor?: Actor) {
  const s = await db.query.classSession.findFirst({
    where: and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId)),
  });
  if (!s) return null;
  const rows = await db
    .select({
      bookingId: schema.booking.id,
      source: schema.booking.source,
      studentId: schema.student.id,
      name: schema.student.name,
      image: schema.user.image,
      phone: schema.student.phone,
      level: schema.student.level,
      hasAccount: sql<number>`${schema.student.userId} is not null`,
      status: schema.attendance.status,
      markedAt: schema.attendance.markedAt,
      checkedInAt: schema.booking.checkedInAt,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
    .leftJoin(schema.attendance, eq(schema.attendance.bookingId, schema.booking.id))
    .where(
      and(
        eq(schema.booking.sessionId, sessionId),
        eq(schema.booking.organizationId, organizationId),
        eq(schema.booking.status, 'CONFIRMED')
      )
    )
    .orderBy(schema.student.name);

  const contact = !!actor && (await userCan(organizationId, actor.userId, 'student', 'read_contact'));
  const list = rows.map((r) => ({ ...r, phone: contact ? r.phone : null, hasAccount: !!r.hasAccount }));
  // ¿Puede esta persona pasar lista aquí? (si no imparte la clase y no tiene `update_any`, solo la ve)
  const mine = !!actor && s.instructorUserId === actor.userId;
  const canMark = !!actor && (mine || (await userCan(organizationId, actor.userId, 'attendance', 'update_any')));
  const teacher = s.instructorUserId
    ? ((await db.query.user.findFirst({ where: eq(schema.user.id, s.instructorUserId) }))?.name ?? null)
    : null;
  const present = list.filter((r) => r.status === 'PRESENT').length;
  const absent = list.filter((r) => r.status === 'ABSENT').length;
  return {
    session: { id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity, status: s.status, closedAt: s.attendanceClosedAt },
    canMark,
    teacherName: teacher,
    summary: { total: list.length, present, absent, unmarked: list.length - present - absent },
    // Cuándo se habilita el pase de lista (para mostrar un aviso claro antes de tiempo).
    opensAt: new Date(s.startsAt.getTime() - MARK_WINDOW_MIN * 60_000),
    students: list,
  };
}

/** Marca presente/falta (o `null` para dejar sin marcar). Reemplaza el estado anterior de esa reserva. */
export async function markAttendance(
  actor: Actor,
  organizationId: string,
  sessionId: string,
  bookingId: string,
  status: AttendanceStatus | null
) {
  const check = await sessionForMarking(organizationId, sessionId, actor);
  if ('error' in check) return { error: check.error } as { error: AttendanceFail };
  const b = await db.query.booking.findFirst({
    where: and(
      eq(schema.booking.id, bookingId),
      eq(schema.booking.sessionId, sessionId),
      eq(schema.booking.organizationId, organizationId),
      eq(schema.booking.status, 'CONFIRMED')
    ),
  });
  if (!b) return { error: 'NOT_FOUND' as const };

  const write: BatchItem<'sqlite'> =
    status === null
      ? db.delete(schema.attendance).where(eq(schema.attendance.bookingId, bookingId))
      : db
          .insert(schema.attendance)
          .values({ organizationId, sessionId, bookingId, studentId: b.studentId, status, markedBy: actor.userId })
          .onConflictDoUpdate({ target: schema.attendance.bookingId, set: { status, markedBy: actor.userId, markedAt: new Date() } });
  await db.batch([
    write,
    auditStatement({
      organizationId,
      actorUserId: actor.userId,
      action: 'attendance.marked',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { sessionId, status },
    }),
  ] as Batch);
  return { ok: true as const };
}

/** Cierra la lista: lo que quedó sin marcar se registra (presente si el alumno avisó que llegó, falta si no), en la misma transacción. */
export async function closeAttendance(actor: Actor, organizationId: string, sessionId: string) {
  const check = await sessionForMarking(organizationId, sessionId, actor);
  if ('error' in check) return { error: check.error } as { error: AttendanceFail };

  const marked = db.select({ id: schema.attendance.bookingId }).from(schema.attendance).where(eq(schema.attendance.sessionId, sessionId));
  const pending = await db
    .select({ bookingId: schema.booking.id, studentId: schema.booking.studentId, checkedInAt: schema.booking.checkedInAt })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.sessionId, sessionId),
        eq(schema.booking.organizationId, organizationId),
        eq(schema.booking.status, 'CONFIRMED'),
        notInArray(schema.booking.id, marked)
      )
    );

  const statements: BatchItem<'sqlite'>[] = [];
  if (pending.length) {
    statements.push(
      db
        .insert(schema.attendance)
        .values(
          pending.map((p) => ({
            organizationId,
            sessionId,
            bookingId: p.bookingId,
            studentId: p.studentId,
            // Quien avisó que llegó y nadie corrigió cuenta como presente; el resto, como falta.
            status: p.checkedInAt && p.checkedInAt <= check.session.endsAt ? ('PRESENT' as const) : ('ABSENT' as const),
            markedBy: actor.userId,
          }))
        )
        .onConflictDoNothing()
    );
  }
  statements.push(
    db.update(schema.classSession).set({ attendanceClosedAt: new Date() }).where(eq(schema.classSession.id, sessionId)),
    auditStatement({
      organizationId,
      actorUserId: actor.userId,
      action: 'attendance.closed',
      entityType: 'class_session',
      entityId: sessionId,
      metadata: {
        autoAbsent: pending.filter((p) => !p.checkedInAt || p.checkedInAt > check.session.endsAt).length,
        autoPresent: pending.filter((p) => p.checkedInAt && p.checkedInAt <= check.session.endsAt).length,
      },
    })
  );
  await db.batch(statements as Batch);
  const present = pending.filter((p) => p.checkedInAt && p.checkedInAt <= check.session.endsAt).length;
  return { ok: true as const, autoAbsent: pending.length - present, autoPresent: present };
}

export async function reopenAttendance(actor: Actor, organizationId: string, sessionId: string) {
  const check = await sessionForMarking(organizationId, sessionId, actor);
  if ('error' in check) return { error: check.error } as { error: AttendanceFail };
  await db.batch([
    db.update(schema.classSession).set({ attendanceClosedAt: null }).where(eq(schema.classSession.id, sessionId)),
    auditStatement({
      organizationId,
      actorUserId: actor.userId,
      action: 'attendance.reopened',
      entityType: 'class_session',
      entityId: sessionId,
    }),
  ] as Batch);
  return { ok: true as const };
}

/* ── Reportes básicos ─────────────────────────────────────────────────────── */

/** Resumen de los últimos `days` días: asistencia, ocupación, ocupación por día y clases con más ocupación. */
export async function reportSummary(organizationId: string, days: number) {
  const detail = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  const tz = detail?.timezone ?? 'America/Mazatlan';
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 3600_000);

  const rows = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      capacity: schema.classSession.capacity,
      serviceId: schema.service.id,
      serviceName: schema.service.name,
      booked: sql<number>`(select count(*) from booking b where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED')`,
      present: sql<number>`(select count(*) from attendance a where a.session_id = ${schema.classSession.id} and a.status = 'PRESENT')`,
      absent: sql<number>`(select count(*) from attendance a where a.session_id = ${schema.classSession.id} and a.status = 'ABSENT')`,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        eq(schema.classSession.status, 'SCHEDULED'),
        gte(schema.classSession.startsAt, from),
        lt(schema.classSession.startsAt, now)
      )
    )
    .limit(2000);

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const capacity = sum((r) => r.capacity);
  const booked = sum((r) => r.booked);
  const present = sum((r) => r.present);
  const absent = sum((r) => r.absent);

  // Ocupación por día de la semana (en la zona de la organización), lunes a domingo.
  const byDay = new Map<number, { cap: number; booked: number }>();
  for (const r of rows) {
    const wd = weekdayOf(localDate(r.startsAt.getTime(), tz));
    const cur = byDay.get(wd) ?? { cap: 0, booked: 0 };
    byDay.set(wd, { cap: cur.cap + r.capacity, booked: cur.booked + r.booked });
  }
  const labels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const v = byDay.get(wd);
    return {
      label: labels[wd],
      occupancy: v && v.cap ? v.booked / v.cap : 0,
      sessions: rows.filter((r) => weekdayOf(localDate(r.startsAt.getTime(), tz)) === wd).length,
    };
  });

  const byService = new Map<string, { name: string; cap: number; booked: number; present: number; sessions: number }>();
  for (const r of rows) {
    const cur = byService.get(r.serviceId) ?? { name: r.serviceName, cap: 0, booked: 0, present: 0, sessions: 0 };
    byService.set(r.serviceId, {
      ...cur,
      cap: cur.cap + r.capacity,
      booked: cur.booked + r.booked,
      present: cur.present + r.present,
      sessions: cur.sessions + 1,
    });
  }
  const topServices = [...byService.entries()]
    .map(([id, v]) => ({ id, name: v.name, sessions: v.sessions, attended: v.present, occupancy: v.cap ? v.booked / v.cap : 0 }))
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, 6);

  const students = await db
    .select({ n: sql<number>`count(distinct ${schema.attendance.studentId})` })
    .from(schema.attendance)
    .where(
      and(
        eq(schema.attendance.organizationId, organizationId),
        eq(schema.attendance.status, 'PRESENT'),
        gte(schema.attendance.markedAt, from)
      )
    );

  return {
    days,
    sessions: rows.length,
    capacity,
    booked,
    attended: present,
    absent,
    activeStudents: students[0]?.n ?? 0,
    occupancy: capacity ? booked / capacity : 0,
    // Tasa sobre lo ya registrado (las sesiones sin lista cerrada no cuentan como faltas).
    attendanceRate: present + absent ? present / (present + absent) : null,
    weekdays,
    topServices,
  };
}
