import { and, asc, count, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { userCan } from '../auth/access';
import { addDays, datesInRange, isDate, isTime, localDate, weekdayOf, zonedTimeToUtc } from '../lib/time';
import { sendClassCanceled } from '../emails/send';
import { notify } from './notifications';
import { closeWaitlistForCanceled, settleWaitlist } from './waitlist';
import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

export const MAX_SESSIONS_PER_SCHEDULE = 150;
const MAX_RANGE_DAYS = 200;

/* ── Tipos de entrada ─────────────────────────────────────────────────────── */

export type ServiceInput = {
  name: string;
  description?: string;
  kind?: 'GROUP' | 'PRIVATE' | 'WORKSHOP';
  disciplineId?: string;
  level?: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  /** Centavos. */
  priceCents: number;
  durationMin: number;
  defaultCapacity?: number;
  /** Solo privadas. */
  instructorUserId?: string;
  bufferMin?: number;
};

export type ScheduleInput = {
  roomId: string;
  instructorUserId?: string;
  /** Si se omite, se usa el cupo por defecto del servicio o el del espacio. */
  capacity?: number;
  startTime: string;
  /** 0 = domingo … 6 = sábado. Se ignora si no hay `endDate` (sesión única). */
  weekdays?: number[];
  startDate: string;
  /** Sin `endDate` se crea UNA sola sesión en `startDate`. */
  endDate?: string;
};

export type Conflict = { kind: 'room' | 'instructor'; date: string; time: string; with: string };

type Fail =
  | { error: 'NOT_FOUND' | 'DISCIPLINE_INVALID' | 'ROOM_NOT_FOUND' | 'INSTRUCTOR_INVALID' | 'CAPACITY_EXCEEDS_ROOM' }
  | { error: 'INVALID_SCHEDULE'; reason: string }
  | { error: 'CONFLICT'; conflicts: Conflict[] };

const clean = (v: string | undefined | null) => {
  const t = v?.trim();
  return t ? t : null;
};

/* ── Contexto de la organización ──────────────────────────────────────────── */

async function orgContext(organizationId: string) {
  const d = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  return d ? { timezone: d.timezone, verticalId: d.verticalId, currency: d.currency } : null;
}

/** Quien puede impartir: miembros cuyo rol tiene `session:teach` (instructor, admin, propietario o un rol personalizado). */
async function validInstructor(organizationId: string, userId: string) {
  return userCan(organizationId, userId, 'session', 'teach');
}

/* ── Programación (series de sesiones) ────────────────────────────────────── */

type PlannedSession = { date: string; startsAt: number; endsAt: number };

/** Convierte la regla de recurrencia en sesiones concretas, en UTC. */
function plan(schedule: ScheduleInput, durationMin: number, tz: string): PlannedSession[] | { error: string } {
  if (!isDate(schedule.startDate) || !isTime(schedule.startTime)) return { error: 'Fecha u hora inválida.' };
  const today = localDate(Date.now(), tz);
  if (schedule.startDate < today) return { error: 'La fecha de inicio no puede estar en el pasado.' };

  let dates: string[];
  if (!schedule.endDate) {
    dates = [schedule.startDate];
  } else {
    if (!isDate(schedule.endDate) || schedule.endDate < schedule.startDate)
      return { error: 'La fecha final debe ser posterior al inicio.' };
    if (schedule.endDate > addDays(schedule.startDate, MAX_RANGE_DAYS)) return { error: `El rango máximo es de ${MAX_RANGE_DAYS} días.` };
    const wd = [...new Set(schedule.weekdays ?? [])].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    if (!wd.length) return { error: 'Elige al menos un día de la semana.' };
    dates = datesInRange(schedule.startDate, schedule.endDate, wd);
  }
  if (!dates.length) return { error: 'Ninguna fecha cae en los días elegidos.' };
  if (dates.length > MAX_SESSIONS_PER_SCHEDULE) return { error: `Son demasiadas sesiones (máximo ${MAX_SESSIONS_PER_SCHEDULE}).` };

  return dates.map((date) => {
    const startsAt = zonedTimeToUtc(date, schedule.startTime, tz);
    return { date, startsAt, endsAt: startsAt + durationMin * 60_000 };
  });
}

/** Busca sesiones ya programadas que choquen en el mismo espacio o con el mismo instructor. */
async function findConflicts(
  organizationId: string,
  planned: PlannedSession[],
  roomId: string,
  instructorUserId: string | null,
  tz: string,
  ignore?: string | Set<string>
) {
  const min = Math.min(...planned.map((p) => p.startsAt));
  const max = Math.max(...planned.map((p) => p.endsAt));
  const who = [
    eq(schema.classSession.roomId, roomId),
    ...(instructorUserId ? [eq(schema.classSession.instructorUserId, instructorUserId)] : []),
  ];
  const existing = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      roomId: schema.classSession.roomId,
      instructorUserId: schema.classSession.instructorUserId,
      name: schema.service.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        eq(schema.classSession.status, 'SCHEDULED'),
        lt(schema.classSession.startsAt, new Date(max)),
        gt(schema.classSession.endsAt, new Date(min)),
        or(...who)
      )
    );

  const conflicts: Conflict[] = [];
  for (const p of planned) {
    for (const e of existing) {
      if (typeof ignore === 'string' ? e.id === ignore : ignore?.has(e.id)) continue;
      if (e.startsAt.getTime() < p.endsAt && e.endsAt.getTime() > p.startsAt) {
        const time = new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
          e.startsAt
        );
        if (e.roomId === roomId) conflicts.push({ kind: 'room', date: p.date, time, with: e.name });
        else if (instructorUserId && e.instructorUserId === instructorUserId)
          conflicts.push({ kind: 'instructor', date: p.date, time, with: e.name });
      }
    }
  }
  return conflicts;
}

/** Valida espacio, instructor y cupo y arma las filas (serie + sesiones) listas para insertar. */
async function buildSchedule(
  userId: string,
  organizationId: string,
  svc: { id: string; durationMin: number; defaultCapacity: number | null; name: string },
  schedule: ScheduleInput
): Promise<{ statements: BatchItem<'sqlite'>[]; count: number } | Fail> {
  const ctx = await orgContext(organizationId);
  if (!ctx) return { error: 'NOT_FOUND' };

  const room = await db.query.room.findFirst({
    where: and(eq(schema.room.id, schedule.roomId), eq(schema.room.organizationId, organizationId)),
  });
  if (!room) return { error: 'ROOM_NOT_FOUND' };

  const instructorUserId = schedule.instructorUserId ?? null;
  if (instructorUserId && !(await validInstructor(organizationId, instructorUserId))) return { error: 'INSTRUCTOR_INVALID' };

  const capacity = schedule.capacity ?? Math.min(svc.defaultCapacity ?? room.capacity, room.capacity);
  if (capacity < 1 || capacity > room.capacity) return { error: 'CAPACITY_EXCEEDS_ROOM' };

  const planned = plan(schedule, svc.durationMin, ctx.timezone);
  if ('error' in planned) return { error: 'INVALID_SCHEDULE', reason: planned.error };

  const conflicts = await findConflicts(organizationId, planned, room.id, instructorUserId, ctx.timezone);
  if (conflicts.length) return { error: 'CONFLICT', conflicts: conflicts.slice(0, 8) };

  const seriesId = crypto.randomUUID();
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.sessionSeries).values({
      id: seriesId,
      organizationId,
      serviceId: svc.id,
      roomId: room.id,
      instructorUserId,
      capacity,
      weekdays: JSON.stringify(schedule.endDate ? (schedule.weekdays ?? []) : [weekdayOf(schedule.startDate)]),
      startTime: schedule.startTime,
      durationMin: svc.durationMin,
      startDate: schedule.startDate,
      endDate: schedule.endDate ?? schedule.startDate,
      timezone: ctx.timezone,
      createdBy: userId,
    }),
  ];
  // Filas en bloques para no rebasar el límite de variables de SQLite.
  for (let i = 0; i < planned.length; i += 40) {
    statements.push(
      db.insert(schema.classSession).values(
        planned.slice(i, i + 40).map((p) => ({
          organizationId,
          serviceId: svc.id,
          seriesId,
          roomId: room.id,
          instructorUserId,
          startsAt: new Date(p.startsAt),
          endsAt: new Date(p.endsAt),
          capacity,
        }))
      )
    );
  }
  statements.push(
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'sessions.scheduled',
      entityType: 'service',
      entityId: svc.id,
      metadata: { seriesId, sessions: planned.length, roomId: room.id, instructorUserId, capacity },
    })
  );
  return { statements, count: planned.length };
}

/* ── Servicios ────────────────────────────────────────────────────────────── */

async function checkDiscipline(organizationId: string, disciplineId: string) {
  const ctx = await orgContext(organizationId);
  if (!ctx) return false;
  // Regla 11 del PRD: la disciplina debe ser del rubro de la organización.
  const d = await db.query.discipline.findFirst({
    where: and(
      eq(schema.discipline.id, disciplineId),
      eq(schema.discipline.verticalId, ctx.verticalId),
      eq(schema.discipline.isActive, true)
    ),
  });
  return !!d;
}

/** Crea el servicio y, si se envía `schedule`, sus sesiones, todo en una transacción. */
export async function createService(userId: string, organizationId: string, input: ServiceInput, schedule?: ScheduleInput) {
  if (input.disciplineId && !(await checkDiscipline(organizationId, input.disciplineId))) return { error: 'DISCIPLINE_INVALID' as const };

  if (input.instructorUserId && !(await validInstructor(organizationId, input.instructorUserId)))
    return { error: 'INSTRUCTOR_INVALID' as const };

  const id = crypto.randomUUID();
  const svc = { id, durationMin: input.durationMin, defaultCapacity: input.defaultCapacity ?? null, name: input.name.trim() };
  let scheduled: { statements: BatchItem<'sqlite'>[]; count: number } | null = null;

  const insertService = db.insert(schema.service).values({
    id,
    organizationId,
    name: svc.name,
    description: clean(input.description),
    kind: input.kind ?? 'GROUP',
    disciplineId: input.disciplineId ?? null,
    level: input.level ?? 'ALL',
    priceCents: input.priceCents,
    durationMin: input.durationMin,
    defaultCapacity: input.defaultCapacity ?? null,
    instructorUserId: input.kind === 'PRIVATE' ? (input.instructorUserId ?? userId) : null,
    bufferMin: input.bufferMin ?? 0,
  });

  if (schedule) {
    // El servicio aún no existe: se valida el calendario con sus datos y se inserta en el mismo batch.
    const r = await buildSchedule(userId, organizationId, svc, schedule);
    if ('error' in r) return r;
    scheduled = r;
  }

  const statements: BatchItem<'sqlite'>[] = [
    insertService,
    ...(scheduled?.statements ?? []),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'service.created',
      entityType: 'service',
      entityId: id,
      metadata: { name: svc.name, priceCents: input.priceCents },
    }),
  ];
  await db.batch(statements as Batch);
  return { id, sessions: scheduled?.count ?? 0 };
}

/** Agrega sesiones a un servicio existente. */
export async function scheduleSessions(userId: string, organizationId: string, serviceId: string, schedule: ScheduleInput) {
  const svc = await db.query.service.findFirst({
    where: and(eq(schema.service.id, serviceId), eq(schema.service.organizationId, organizationId)),
  });
  if (!svc || !svc.isActive) return { error: 'NOT_FOUND' as const };
  const r = await buildSchedule(userId, organizationId, svc, schedule);
  if ('error' in r) return r;
  await db.batch(r.statements as Batch);
  return { sessions: r.count };
}

export async function listServices(organizationId: string) {
  const services = await db
    .select({
      id: schema.service.id,
      name: schema.service.name,
      description: schema.service.description,
      kind: schema.service.kind,
      level: schema.service.level,
      priceCents: schema.service.priceCents,
      durationMin: schema.service.durationMin,
      defaultCapacity: schema.service.defaultCapacity,
      instructorUserId: schema.service.instructorUserId,
      bufferMin: schema.service.bufferMin,
      isActive: schema.service.isActive,
      disciplineId: schema.service.disciplineId,
      disciplineName: schema.discipline.name,
    })
    .from(schema.service)
    .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
    .where(eq(schema.service.organizationId, organizationId))
    .orderBy(asc(schema.service.name));

  const upcoming = await db
    .select({ serviceId: schema.classSession.serviceId, n: count() })
    .from(schema.classSession)
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        eq(schema.classSession.status, 'SCHEDULED'),
        gte(schema.classSession.startsAt, new Date())
      )
    )
    .groupBy(schema.classSession.serviceId);
  const byService = new Map(upcoming.map((u) => [u.serviceId, u.n]));
  return services.map((s) => ({ ...s, upcomingSessions: byService.get(s.id) ?? 0 }));
}

export async function updateService(
  userId: string,
  organizationId: string,
  serviceId: string,
  input: Partial<ServiceInput> & { isActive?: boolean }
) {
  const svc = await db.query.service.findFirst({
    where: and(eq(schema.service.id, serviceId), eq(schema.service.organizationId, organizationId)),
  });
  if (!svc) return { error: 'NOT_FOUND' as const };
  if (input.disciplineId && !(await checkDiscipline(organizationId, input.disciplineId))) return { error: 'DISCIPLINE_INVALID' as const };

  const set: Partial<typeof schema.service.$inferInsert> = {};
  if (input.name?.trim()) set.name = input.name.trim();
  if (input.description !== undefined) set.description = clean(input.description);
  if (input.kind) set.kind = input.kind;
  if (input.disciplineId) set.disciplineId = input.disciplineId;
  if (input.level) set.level = input.level;
  if (input.priceCents !== undefined) set.priceCents = input.priceCents;
  if (input.durationMin !== undefined) set.durationMin = input.durationMin;
  if (input.defaultCapacity !== undefined) set.defaultCapacity = input.defaultCapacity;
  if (input.bufferMin !== undefined) set.bufferMin = input.bufferMin;
  if (input.instructorUserId) {
    if (!(await validInstructor(organizationId, input.instructorUserId))) return { error: 'INSTRUCTOR_INVALID' as const };
    set.instructorUserId = input.instructorUserId;
  }
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (!Object.keys(set).length) return { ok: true as const };

  await db.batch([
    db
      .update(schema.service)
      .set(set)
      .where(and(eq(schema.service.id, serviceId), eq(schema.service.organizationId, organizationId))),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'service.updated',
      entityType: 'service',
      entityId: serviceId,
      metadata: input,
    }),
  ] as Batch);
  return { ok: true as const };
}

/* ── Sesiones ─────────────────────────────────────────────────────────────── */

/** Sesiones entre dos fechas locales (incluidas), con servicio, espacio e instructor. */
export async function listSessions(organizationId: string, fromDate: string, toDate: string) {
  const ctx = await orgContext(organizationId);
  if (!ctx || !isDate(fromDate) || !isDate(toDate)) return null;
  const from = new Date(zonedTimeToUtc(fromDate, '00:00', ctx.timezone));
  const to = new Date(zonedTimeToUtc(addDays(toDate, 1), '00:00', ctx.timezone));

  const rows = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      capacity: schema.classSession.capacity,
      status: schema.classSession.status,
      seriesId: schema.classSession.seriesId,
      serviceId: schema.service.id,
      serviceName: schema.service.name,
      kind: schema.service.kind,
      priceCents: schema.service.priceCents,
      roomId: schema.room.id,
      roomName: schema.room.name,
      instructorId: schema.user.id,
      instructorName: schema.user.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .leftJoin(schema.user, eq(schema.user.id, schema.classSession.instructorUserId))
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        gte(schema.classSession.startsAt, from),
        lt(schema.classSession.startsAt, to)
      )
    )
    .orderBy(asc(schema.classSession.startsAt));

  // Reservas confirmadas por sesión (una sola consulta para toda la lista).
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ sessionId: schema.booking.sessionId, n: count() })
        .from(schema.booking)
        .where(and(inArray(schema.booking.sessionId, ids), eq(schema.booking.status, 'CONFIRMED')))
        .groupBy(schema.booking.sessionId)
    : [];
  const booked = new Map(counts.map((c) => [c.sessionId, c.n]));

  return {
    timezone: ctx.timezone,
    currency: ctx.currency,
    sessions: rows.map((r) => ({ ...r, booked: booked.get(r.id) ?? 0, date: localDate(r.startsAt.getTime(), ctx.timezone) })),
  };
}

export async function updateSession(
  userId: string,
  organizationId: string,
  sessionId: string,
  input: { roomId?: string; instructorUserId?: string | null; capacity?: number; date?: string; startTime?: string }
) {
  const s = await db.query.classSession.findFirst({
    where: and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId)),
  });
  if (!s || s.status !== 'SCHEDULED') return { error: 'NOT_FOUND' as const };
  const ctx = await orgContext(organizationId);
  if (!ctx) return { error: 'NOT_FOUND' as const };

  const roomId = input.roomId ?? s.roomId;
  const room = roomId
    ? await db.query.room.findFirst({ where: and(eq(schema.room.id, roomId), eq(schema.room.organizationId, organizationId)) })
    : null;
  if (!room) return { error: 'ROOM_NOT_FOUND' as const };
  const instructorUserId = input.instructorUserId === undefined ? s.instructorUserId : input.instructorUserId;
  if (instructorUserId && !(await validInstructor(organizationId, instructorUserId))) return { error: 'INSTRUCTOR_INVALID' as const };
  const capacity = input.capacity ?? Math.min(s.capacity, room.capacity);
  if (capacity < 1 || capacity > room.capacity) return { error: 'CAPACITY_EXCEEDS_ROOM' as const };

  const durationMs = s.endsAt.getTime() - s.startsAt.getTime();
  let startsAt = s.startsAt.getTime();
  if (input.date || input.startTime) {
    const date = input.date ?? localDate(startsAt, ctx.timezone);
    const time =
      input.startTime ??
      new Intl.DateTimeFormat('en-GB', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(s.startsAt);
    if (!isDate(date) || !isTime(time)) return { error: 'INVALID_SCHEDULE' as const, reason: 'Fecha u hora inválida.' };
    startsAt = zonedTimeToUtc(date, time, ctx.timezone);
  }
  const planned = [{ date: localDate(startsAt, ctx.timezone), startsAt, endsAt: startsAt + durationMs }];
  const conflicts = await findConflicts(organizationId, planned, room.id, instructorUserId, ctx.timezone, sessionId);
  if (conflicts.length) return { error: 'CONFLICT' as const, conflicts };

  await db.batch([
    db
      .update(schema.classSession)
      .set({ roomId: room.id, instructorUserId, capacity, startsAt: new Date(startsAt), endsAt: new Date(startsAt + durationMs) })
      .where(and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId))),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'session.updated',
      entityType: 'class_session',
      entityId: sessionId,
      metadata: input,
    }),
  ] as Batch);
  // Si se amplió el cupo, esos lugares se ofrecen a la lista de espera.
  if (capacity > s.capacity) await settleWaitlist(sessionId);
  return { ok: true as const };
}

/** Cancela una sesión o, con `following`, esa y las siguientes de su serie. */
export async function cancelSession(userId: string, organizationId: string, sessionId: string, scope: 'one' | 'following') {
  const s = await db.query.classSession.findFirst({
    where: and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId)),
  });
  if (!s || s.status !== 'SCHEDULED') return { error: 'NOT_FOUND' as const };
  const where =
    scope === 'following' && s.seriesId
      ? and(
          eq(schema.classSession.organizationId, organizationId),
          eq(schema.classSession.seriesId, s.seriesId),
          eq(schema.classSession.status, 'SCHEDULED'),
          gte(schema.classSession.startsAt, s.startsAt)
        )
      : and(eq(schema.classSession.id, sessionId), eq(schema.classSession.organizationId, organizationId));
  const affected = await db.select({ id: schema.classSession.id }).from(schema.classSession).where(where);
  const now = new Date();
  // A quién avisar: reservas confirmadas de esas sesiones (se leen ANTES de cancelarlas).
  const toNotify = affected.length ? await bookedPeople(affected.map((a) => a.id)) : [];
  const cancelStatements: BatchItem<'sqlite'>[] = [
    // Las reservas de las sesiones canceladas se cancelan también; los créditos no se pierden porque solo se
    // consumen con la asistencia (presente), nunca con la reserva.
    ...(affected.length
      ? [
          db
            .update(schema.booking)
            .set({ status: 'CANCELED', canceledAt: now, canceledBy: userId, cancelReason: 'La academia canceló la clase' })
            .where(
              and(
                inArray(
                  schema.booking.sessionId,
                  affected.map((a) => a.id)
                ),
                eq(schema.booking.status, 'CONFIRMED')
              )
            ),
        ]
      : []),
    db.update(schema.classSession).set({ status: 'CANCELED', canceledAt: now }).where(where),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'session.canceled',
      entityType: 'class_session',
      entityId: sessionId,
      metadata: { scope, count: affected.length },
    }),
  ];
  await db.batch(cancelStatements as Batch);
  await notifyCanceled(organizationId, toNotify);
  await closeWaitlistForCanceled(affected.map((a) => a.id));
  return { canceled: affected.length };
}

type Booked = { userId: string | null; email: string | null; name: string; service: string; startsAt: Date };

/** Personas con reserva confirmada en esas sesiones, con el correo de su cuenta o el que dejó la academia. */
export async function bookedPeople(sessionIds: string[]): Promise<Booked[]> {
  const rows = await db
    .select({
      userId: schema.student.userId,
      studentEmail: schema.student.email,
      userEmail: schema.user.email,
      name: schema.student.name,
      service: schema.service.name,
      startsAt: schema.classSession.startsAt,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .where(and(inArray(schema.booking.sessionId, sessionIds), eq(schema.booking.status, 'CONFIRMED')));
  return rows.map((r) => ({ userId: r.userId, email: r.userEmail ?? r.studentEmail, name: r.name, service: r.service, startsAt: r.startsAt }));
}

/** Un correo por persona y clase (si se cancelan varias sesiones, uno solo con el rango). Mejor esfuerzo: nunca tumba la cancelación. */
export async function notifyCanceled(organizationId: string, people: Booked[], knownName?: string, knownTz?: string | null) {
  if (!people.length) return;
  // Si la academia ya se borró, el nombre y la zona horaria llegan de quien llama.
  const [org, detail] = knownName
    ? [{ name: knownName }, { timezone: knownTz }]
    : await Promise.all([
        db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) }),
        db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) }),
      ]);
  const tz = detail?.timezone ?? 'America/Mexico_City';
  const day = (d: Date) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
  const groups = new Map<string, Booked[]>();
  for (const p of people) {
    if (!p.email) continue;
    const key = `${p.email.toLowerCase()}|${p.service}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  await Promise.allSettled(
    [...groups.values()].slice(0, 300).map((list) => {
      const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const first = sorted[0];
      const when =
        sorted.length === 1
          ? `${day(first.startsAt)} a las ${time(first.startsAt)}`
          : `${day(first.startsAt)} al ${day(sorted[sorted.length - 1].startsAt)} (${sorted.length} clases)`;
      return sendClassCanceled(first.email!, { name: first.name, organization: org?.name ?? 'La academia', service: first.service, when });
    })
  );
  // Además del correo, un aviso dentro de la app (y push) para quien tiene cuenta: una sola vez por persona y clase.
  const perUser = new Map<string, Booked[]>();
  for (const p of people) if (p.userId) perUser.set(`${p.userId}|${p.service}`, [...(perUser.get(`${p.userId}|${p.service}`) ?? []), p]);
  await Promise.allSettled(
    [...perUser.values()].slice(0, 300).map((list) => {
      const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const first = sorted[0];
      const body = sorted.length === 1 ? `${first.service} · ${day(first.startsAt)}, ${time(first.startsAt)}` : `${first.service} · ${sorted.length} clases desde el ${day(first.startsAt)}`;
      return notify(first.userId!, { category: 'class', organizationId, title: `${org?.name ?? 'La academia'} canceló tu clase`, body, url: '/my-classes' });
    })
  );
}

/* ── Editar un horario recurrente (serie) ─────────────────────────────────── */

export type SeriesEditInput = { weekdays: number[]; startDate: string; endDate: string; startTime: string };

/** Horarios recurrentes de un servicio con cuántas sesiones próximas y reservas tienen. */
export async function listSeries(organizationId: string, serviceId: string) {
  const ctx = await orgContext(organizationId);
  if (!ctx) return null;
  const now = Date.now();
  const rows = await db
    .select({
      id: schema.sessionSeries.id,
      weekdays: schema.sessionSeries.weekdays,
      startTime: schema.sessionSeries.startTime,
      startDate: schema.sessionSeries.startDate,
      endDate: schema.sessionSeries.endDate,
      capacity: schema.sessionSeries.capacity,
      roomName: schema.room.name,
      instructorName: schema.user.name,
      upcoming: sql<number>`(select count(*) from class_session c where c.series_id = session_series.id and c.status = 'SCHEDULED' and c.starts_at > ${now})`,
      upcomingBookings: sql<number>`(select count(*) from booking b join class_session c on c.id = b.session_id where c.series_id = session_series.id and c.status = 'SCHEDULED' and c.starts_at > ${now} and b.status = 'CONFIRMED')`,
    })
    .from(schema.sessionSeries)
    .leftJoin(schema.room, eq(schema.room.id, schema.sessionSeries.roomId))
    .leftJoin(schema.user, eq(schema.user.id, schema.sessionSeries.instructorUserId))
    .where(and(eq(schema.sessionSeries.organizationId, organizationId), eq(schema.sessionSeries.serviceId, serviceId)))
    .orderBy(asc(schema.sessionSeries.startDate));
  // Solo los horarios recurrentes con algo por delante (una sesión única o series ya terminadas no se listan).
  return rows
    .map((r) => ({
      ...r,
      weekdays: JSON.parse(r.weekdays) as number[],
      upcoming: Number(r.upcoming),
      upcomingBookings: Number(r.upcomingBookings),
    }))
    .filter((r) => r.upcoming > 0 || r.endDate >= localDate(now, ctx.timezone));
}

type EditSummary = {
  /** Sesiones nuevas que se crearían. */
  add: number;
  /** Sesiones próximas que dejarían de existir. */
  remove: number;
  /** De esas, las que tienen reservas confirmadas (hay que avisar). */
  withBookings: { sessionId: string; startsAt: number; bookings: number }[];
  bookingsAffected: number;
};

/**
 * Cambia el calendario de una serie (días, fecha de inicio/fin u hora) comparando las sesiones deseadas con las que ya
 * existen: las que coinciden NO se tocan, las que faltan se crean y las que sobran se quitan. Las sesiones pasadas nunca
 * se modifican. Quitar sesiones con reservas exige `force` y cancela esas reservas (los créditos no se consumen con la
 * reserva, así que cada persona conserva su clase para agendar otra).
 */
export async function editSeries(
  userId: string,
  organizationId: string,
  seriesId: string,
  input: SeriesEditInput,
  opts: { dryRun?: boolean; force?: boolean } = {}
) {
  const series = await db.query.sessionSeries.findFirst({
    where: and(eq(schema.sessionSeries.id, seriesId), eq(schema.sessionSeries.organizationId, organizationId)),
  });
  if (!series) return { error: 'NOT_FOUND' as const };
  const tz = series.timezone;

  const weekdays = [...new Set(input.weekdays)].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!isDate(input.startDate) || !isDate(input.endDate) || !isTime(input.startTime))
    return { error: 'INVALID_SCHEDULE' as const, reason: 'Fecha u hora inválida.' };
  if (input.endDate < input.startDate)
    return { error: 'INVALID_SCHEDULE' as const, reason: 'La fecha final debe ser posterior al inicio.' };
  if (input.endDate > addDays(input.startDate, MAX_RANGE_DAYS))
    return { error: 'INVALID_SCHEDULE' as const, reason: `El rango máximo es de ${MAX_RANGE_DAYS} días.` };
  if (!weekdays.length) return { error: 'INVALID_SCHEDULE' as const, reason: 'Elige al menos un día de la semana.' };

  const now = Date.now();
  const durationMs = series.durationMin * 60_000;
  const desired = datesInRange(input.startDate, input.endDate, weekdays)
    .map((date) => ({ date, startsAt: zonedTimeToUtc(date, input.startTime, tz) }))
    .filter((d) => d.startsAt > now);
  if (desired.length > MAX_SESSIONS_PER_SCHEDULE)
    return { error: 'INVALID_SCHEDULE' as const, reason: `Son demasiadas sesiones (máximo ${MAX_SESSIONS_PER_SCHEDULE}).` };

  const existing = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      confirmed: sql<number>`(select count(*) from booking b where b.session_id = class_session.id and b.status = 'CONFIRMED')`,
      anyBooking: sql<number>`(select count(*) from booking b where b.session_id = class_session.id)`,
      anyAttendance: sql<number>`(select count(*) from attendance a where a.session_id = class_session.id)`,
    })
    .from(schema.classSession)
    .where(
      and(
        eq(schema.classSession.seriesId, seriesId),
        eq(schema.classSession.status, 'SCHEDULED'),
        gt(schema.classSession.startsAt, new Date(now))
      )
    );

  const have = new Set(existing.map((e) => e.startsAt.getTime()));
  const want = new Set(desired.map((d) => d.startsAt));
  const toAdd = desired.filter((d) => !have.has(d.startsAt));
  const toRemove = existing.filter((e) => !want.has(e.startsAt.getTime()));
  const withBookings = toRemove.filter((e) => Number(e.confirmed) > 0);

  const summary: EditSummary = {
    add: toAdd.length,
    remove: toRemove.length,
    withBookings: withBookings.map((e) => ({ sessionId: e.id, startsAt: e.startsAt.getTime(), bookings: Number(e.confirmed) })),
    bookingsAffected: withBookings.reduce((a, e) => a + Number(e.confirmed), 0),
  };

  if (toAdd.length) {
    const planned = toAdd.map((d) => ({ date: d.date, startsAt: d.startsAt, endsAt: d.startsAt + durationMs }));
    const conflicts = series.roomId
      ? await findConflicts(organizationId, planned, series.roomId, series.instructorUserId, tz, new Set(toRemove.map((e) => e.id)))
      : [];
    if (conflicts.length) return { error: 'CONFLICT' as const, conflicts: conflicts.slice(0, 8) };
  }

  if (opts.dryRun) return { dryRun: true as const, summary };
  if (withBookings.length && !opts.force) return { error: 'HAS_BOOKINGS' as const, summary };

  const t = new Date();
  const statements: BatchItem<'sqlite'>[] = [];
  for (let i = 0; i < toAdd.length; i += 40) {
    statements.push(
      db.insert(schema.classSession).values(
        toAdd.slice(i, i + 40).map((d) => ({
          organizationId,
          serviceId: series.serviceId,
          seriesId,
          roomId: series.roomId,
          instructorUserId: series.instructorUserId,
          startsAt: new Date(d.startsAt),
          endsAt: new Date(d.startsAt + durationMs),
          capacity: series.capacity,
        }))
      )
    );
  }
  // Sin ningún rastro (reservas o asistencia) la sesión se borra; con historial se conserva como cancelada.
  const clear = toRemove.filter((e) => Number(e.anyBooking) === 0 && Number(e.anyAttendance) === 0).map((e) => e.id);
  const keep = toRemove.filter((e) => Number(e.anyBooking) > 0 || Number(e.anyAttendance) > 0).map((e) => e.id);
  for (let i = 0; i < clear.length; i += 80)
    statements.push(db.delete(schema.classSession).where(inArray(schema.classSession.id, clear.slice(i, i + 80))));
  for (let i = 0; i < keep.length; i += 80) {
    const ids = keep.slice(i, i + 80);
    statements.push(
      db
        .update(schema.booking)
        .set({ status: 'CANCELED', canceledAt: t, canceledBy: userId, cancelReason: 'La academia cambió el horario de la clase' })
        .where(and(inArray(schema.booking.sessionId, ids), eq(schema.booking.status, 'CONFIRMED'))),
      db.update(schema.classSession).set({ status: 'CANCELED', canceledAt: t }).where(inArray(schema.classSession.id, ids))
    );
  }
  statements.push(
    db
      .update(schema.sessionSeries)
      .set({ weekdays: JSON.stringify(weekdays.sort()), startTime: input.startTime, startDate: input.startDate, endDate: input.endDate })
      .where(eq(schema.sessionSeries.id, seriesId)),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'series.edited',
      entityType: 'session_series',
      entityId: seriesId,
      metadata: { ...input, added: toAdd.length, removed: toRemove.length, bookingsCanceled: summary.bookingsAffected },
    })
  );
  await db.batch(statements as Batch);
  // Las sesiones que se conservan como canceladas pudieron tener fila de espera: se cierra y se avisa.
  await closeWaitlistForCanceled(keep);
  return { added: toAdd.length, removed: toRemove.length, bookingsCanceled: summary.bookingsAffected, summary };
}
