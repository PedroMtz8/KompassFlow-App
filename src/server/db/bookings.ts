import { and, asc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { teachingUserIds } from '../auth/access';
import { addDays, localDate, weekdayOf, zonedTimeToUtc } from '../lib/time';
import { isUniqueViolation } from '../lib/db-errors';
import { db, schema } from './index';
import { describeSession, notify } from './notifications';
import { settleWaitlist } from './waitlist';
import { auditStatement } from './organizations';
import { parseTerms } from './terms';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/* ── Alumnos ──────────────────────────────────────────────────────────────── */

/** Registro de alumno de esta cuenta en la organización; se crea la primera vez que reserva. */
export async function ensureStudentForUser(organizationId: string, u: { id: string; name: string; email: string }) {
  const find = () =>
    db.query.student.findFirst({ where: and(eq(schema.student.organizationId, organizationId), eq(schema.student.userId, u.id)) });
  const existing = await find();
  if (existing) return existing.id;
  // Si dos reservas simultáneas intentan crearlo, el índice único deja pasar solo una y la otra lo lee.
  await db.insert(schema.student).values({ organizationId, userId: u.id, name: u.name, email: u.email }).onConflictDoNothing();
  return (await find())!.id;
}

export type StudentInput = {
  name: string;
  phone?: string;
  email?: string;
  level?: 'NEW' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  notes?: string;
};
const clean = (v: string | undefined | null) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function createStudent(actorId: string, organizationId: string, input: StudentInput) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(schema.student).values({
      id,
      organizationId,
      name: input.name.trim(),
      phone: clean(input.phone),
      email: clean(input.email)?.toLowerCase() ?? null,
      level: input.level ?? 'NEW',
      notes: clean(input.notes),
    }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'student.created',
      entityType: 'student',
      entityId: id,
      metadata: { name: input.name },
    }),
  ] as Batch);
  return { id };
}

export async function updateStudent(actorId: string, organizationId: string, studentId: string, input: Partial<StudentInput>) {
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.id, studentId), eq(schema.student.organizationId, organizationId)),
  });
  if (!st) return { error: 'NOT_FOUND' as const };
  const set: Partial<typeof schema.student.$inferInsert> = {};
  if (input.name?.trim()) set.name = input.name.trim();
  if (input.phone !== undefined) set.phone = clean(input.phone);
  if (input.email !== undefined) set.email = clean(input.email)?.toLowerCase() ?? null;
  if (input.level) set.level = input.level;
  if (input.notes !== undefined) set.notes = clean(input.notes);
  if (!Object.keys(set).length) return { ok: true as const };
  await db.batch([
    db
      .update(schema.student)
      .set(set)
      .where(and(eq(schema.student.id, studentId), eq(schema.student.organizationId, organizationId))),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'student.updated',
      entityType: 'student',
      entityId: studentId,
      metadata: Object.keys(set),
    }),
  ] as Batch);
  return { ok: true as const };
}

/** Lista de alumnos con sus asistencias/reservas próximas. `q` busca por nombre, teléfono o correo. */
export type Page = { limit: number; offset: number };
const FIRST_PAGE: Page = { limit: 50, offset: 0 };

export async function listStudents(organizationId: string, q?: string, canContact = true, page: Page = FIRST_PAGE) {
  const term = q?.trim().toLowerCase();
  const rows = await db
    .select({
      id: schema.student.id,
      name: schema.student.name,
      phone: canContact ? schema.student.phone : sql<string | null>`null`,
      email: canContact ? schema.student.email : sql<string | null>`null`,
      level: schema.student.level,
      userId: schema.student.userId,
      image: schema.user.image,
      createdAt: schema.student.createdAt,
      upcoming: sql<number>`(select count(*) from booking b join class_session s on s.id = b.session_id where b.student_id = student.id and b.status = 'CONFIRMED' and s.status = 'SCHEDULED' and s.starts_at >= ${Date.now()})`,
      total: sql<number>`(select count(*) from booking b where b.student_id = student.id and b.status = 'CONFIRMED')`,
    })
    .from(schema.student)
    .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
    .where(
      and(
        eq(schema.student.organizationId, organizationId),
        term
          ? canContact
            ? sql`(lower(${schema.student.name}) like ${`%${term}%`} or ${schema.student.phone} like ${`%${term}%`} or lower(${schema.student.email}) like ${`%${term}%`})`
            : // Sin permiso de contacto solo se busca por nombre: buscar por teléfono o correo revelaría quién lo tiene.
              sql`lower(${schema.student.name}) like ${`%${term}%`}`
          : undefined
      )
    )
    // El id desempata nombres iguales: sin él, una página podría repetir o saltarse a alguien.
    .orderBy(asc(schema.student.name), asc(schema.student.id))
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((r) => ({ ...r, hasAccount: !!r.userId, userId: undefined }));
}

export async function getStudent(organizationId: string, studentId: string, canContact = true) {
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.id, studentId), eq(schema.student.organizationId, organizationId)),
  });
  if (!st) return null;
  // Cuenta creada por esta academia que aún no cambia su contraseña temporal (se puede regenerar).
  const managed = st.userId
    ? await db.query.user.findFirst({ where: and(eq(schema.user.id, st.userId), eq(schema.user.managedByOrgId, organizationId), eq(schema.user.mustChangePassword, true)) })
    : null;
  const history = await db
    .select({
      id: schema.booking.id,
      status: schema.booking.status,
      source: schema.booking.source,
      sessionId: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      serviceName: schema.service.name,
      attendance: schema.attendance.status,
    })
    .from(schema.booking)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .leftJoin(schema.attendance, eq(schema.attendance.bookingId, schema.booking.id))
    .where(eq(schema.booking.studentId, studentId))
    .orderBy(sql`${schema.classSession.startsAt} desc`)
    .limit(30);
  return {
    id: st.id,
    name: st.name,
    phone: canContact ? st.phone : null,
    email: canContact ? st.email : null,
    level: st.level,
    notes: st.notes,
    hasAccount: !!st.userId,
    image: st.userId ? ((await db.query.user.findFirst({ where: eq(schema.user.id, st.userId), columns: { image: true } }))?.image ?? null) : null,
    pendingActivation: !!managed,
    accountUserId: managed ? st.userId : null,
    createdAt: st.createdAt,
    history,
  };
}

/* ── Reservas ─────────────────────────────────────────────────────────────── */

export type BookFail = 'NOT_BOOKABLE' | 'FULL' | 'ALREADY_BOOKED' | 'STUDENT_NOT_FOUND';

/**
 * Reserva un lugar. El control de cupo NO es "leer y luego insertar": la inserción y la verificación
 * ocurren en UNA sentencia atómica (`INSERT … SELECT … WHERE confirmadas < cupo`), y el motor serializa
 * las escrituras. Dos personas reservando el último lugar al mismo tiempo: una entra, la otra recibe FULL.
 */
export async function bookSession(input: {
  organizationId?: string;
  sessionId: string;
  studentId: string;
  source: 'STUDENT' | 'STAFF';
  actorId: string;
}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    const res = await db.run(sql`
      INSERT INTO booking (id, organization_id, session_id, student_id, status, source, created_by, created_at)
      SELECT ${id}, s.organization_id, s.id, ${input.studentId}, 'CONFIRMED', ${input.source}, ${input.actorId}, ${now}
      FROM class_session s
      WHERE s.id = ${input.sessionId}
        AND s.status = 'SCHEDULED'
        AND s.starts_at > ${now}
        ${input.organizationId ? sql`AND s.organization_id = ${input.organizationId}` : sql``}
        AND EXISTS (SELECT 1 FROM student st WHERE st.id = ${input.studentId} AND st.organization_id = s.organization_id)
        AND (SELECT count(*) FROM booking b WHERE b.session_id = s.id AND b.status = 'CONFIRMED')
          + (SELECT count(*) FROM waitlist_entry w WHERE w.session_id = s.id AND w.status = 'OFFERED' AND w.offer_expires_at > ${now} AND w.student_id <> ${input.studentId}) < s.capacity`);

    if (res.rowsAffected === 0) return { error: await diagnose(input) };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'ALREADY_BOOKED' as const };
    throw e;
  }

  // Si esta persona estaba en la fila de espera, la entrada queda resuelta (y el lugar apartado deja de estar apartado).
  await db
    .update(schema.waitlistEntry)
    .set({ status: 'BOOKED' })
    .where(and(eq(schema.waitlistEntry.sessionId, input.sessionId), eq(schema.waitlistEntry.studentId, input.studentId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])));

  const session = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, input.sessionId) });
  await db.insert(schema.auditLog).values({
    organizationId: session?.organizationId ?? null,
    actorUserId: input.actorId,
    action: 'booking.created',
    entityType: 'booking',
    entityId: id,
    metadata: JSON.stringify({ sessionId: input.sessionId, studentId: input.studentId, source: input.source }),
  });
  // Si la academia reservó por la persona, se le avisa (si tiene cuenta): no se entera de otra forma.
  if (input.source === 'STAFF') {
    const st = await db.query.student.findFirst({ where: eq(schema.student.id, input.studentId) });
    const d = st?.userId && st.userId !== input.actorId ? await describeSession(input.sessionId) : null;
    if (st?.userId && d) await notify(st.userId, { category: 'class', organizationId: d.organizationId, title: 'Te reservaron una clase', body: `${d.service} · ${d.when} · ${d.org}`, url: `/booking?bookingId=${id}` });
  }
  return { id };
}

/** Por qué no se pudo reservar (solo para el mensaje; la decisión ya la tomó la sentencia atómica). */
async function diagnose(input: { organizationId?: string; sessionId: string; studentId: string }): Promise<BookFail> {
  const s = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, input.sessionId) });
  if (
    !s ||
    (input.organizationId && s.organizationId !== input.organizationId) ||
    s.status !== 'SCHEDULED' ||
    s.startsAt.getTime() <= Date.now()
  )
    return 'NOT_BOOKABLE';
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.id, input.studentId), eq(schema.student.organizationId, s.organizationId)),
  });
  if (!st) return 'STUDENT_NOT_FOUND';
  // Con la sesión llena y el alumno ya dentro, el mensaje correcto es "ya tienes un lugar", no "llena".
  const mine = await db.query.booking.findFirst({
    where: and(
      eq(schema.booking.sessionId, input.sessionId),
      eq(schema.booking.studentId, input.studentId),
      eq(schema.booking.status, 'CONFIRMED')
    ),
  });
  return mine ? 'ALREADY_BOOKED' : 'FULL';
}

/** Reserva de una persona con cuenta: crea su registro de alumno en la organización si hace falta. */
export async function bookAsUser(u: { id: string; name: string; email: string }, sessionId: string) {
  const s = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, sessionId) });
  if (!s) return { error: 'NOT_BOOKABLE' as const };
  const pub = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, s.organizationId) });
  if (!pub?.isPublished) return { error: 'NOT_BOOKABLE' as const };
  const studentId = await ensureStudentForUser(s.organizationId, u);
  return bookSession({ organizationId: s.organizationId, sessionId, studentId, source: 'STUDENT', actorId: u.id });
}

/**
 * Cancela una reserva. El alumno puede hasta `cancel_window_hours` antes; el personal con permiso
 * (`byStaff`) puede siempre mientras la sesión no haya empezado.
 */
export async function cancelBooking(
  bookingId: string,
  actor: { userId: string; organizationId?: string; byStaff: boolean },
  reason?: string
) {
  const b = await db.query.booking.findFirst({ where: eq(schema.booking.id, bookingId) });
  if (!b || b.status !== 'CONFIRMED') return { error: 'NOT_FOUND' as const };
  if (actor.organizationId && b.organizationId !== actor.organizationId) return { error: 'NOT_FOUND' as const };

  const session = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, b.sessionId) });
  const student = await db.query.student.findFirst({ where: eq(schema.student.id, b.studentId) });
  if (!session || !student) return { error: 'NOT_FOUND' as const };
  if (!actor.byStaff && student.userId !== actor.userId) return { error: 'NOT_FOUND' as const };
  if (session.startsAt.getTime() <= Date.now()) return { error: 'ALREADY_STARTED' as const };

  if (!actor.byStaff) {
    const detail = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, b.organizationId) });
    const hours = detail?.cancelWindowHours ?? 4;
    if (session.startsAt.getTime() - Date.now() < hours * 3600_000) return { error: 'TOO_LATE' as const, hours };
  }

  await db.batch([
    db
      .update(schema.booking)
      .set({ status: 'CANCELED', canceledAt: new Date(), canceledBy: actor.userId, cancelReason: clean(reason) })
      .where(and(eq(schema.booking.id, bookingId), eq(schema.booking.status, 'CONFIRMED'))),
    auditStatement({
      organizationId: b.organizationId,
      actorUserId: actor.userId,
      action: 'booking.canceled',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { byStaff: actor.byStaff, reason: clean(reason) },
    }),
  ] as Batch);
  // El lugar liberado se ofrece al primero de la lista de espera.
  await settleWaitlist(b.sessionId);
  // La academia canceló la reserva de una persona con cuenta: se le avisa (si ella misma canceló, no).
  if (actor.byStaff && student.userId && student.userId !== actor.userId) {
    const d = await describeSession(b.sessionId);
    if (d) await notify(student.userId, { category: 'class', organizationId: b.organizationId, title: 'Cancelaron tu reserva', body: `${d.service} · ${d.when} · ${d.org}`, url: '/my-classes' });
  }
  return { ok: true as const };
}

/** Alumnos con reserva confirmada en una sesión. */
export async function roster(organizationId: string, sessionId: string, canContact = true) {
  const rows = await db
    .select({
      bookingId: schema.booking.id,
      source: schema.booking.source,
      createdAt: schema.booking.createdAt,
      studentId: schema.student.id,
      name: schema.student.name,
      phone: schema.student.phone,
      level: schema.student.level,
      hasAccount: sql<number>`${schema.student.userId} is not null`,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .where(
      and(
        eq(schema.booking.organizationId, organizationId),
        eq(schema.booking.sessionId, sessionId),
        eq(schema.booking.status, 'CONFIRMED')
      )
    )
    .orderBy(asc(schema.booking.createdAt));
  return rows.map((r) => ({ ...r, phone: canContact ? r.phone : null, hasAccount: !!r.hasAccount }));
}

/* ── Descubrimiento y "Mis clases" (lado alumno) ──────────────────────────── */

const DISCOVER_DAYS = 14;

/** Sesiones próximas de organizaciones publicadas, con cupo disponible y si ya reservé. */
export type DiscoverFilters = {
  disciplineIds?: string[];
  verticalId?: string;
  /** Hoy / mañana / fin de semana, según la zona horaria de CADA academia. Varios = "o". */
  when?: ('today' | 'tomorrow' | 'weekend')[];
  levels?: ('BEGINNER' | 'INTERMEDIATE' | 'ADVANCED')[];
  onlyAvailable?: boolean;
  /** Texto libre: clase, academia, disciplina o colonia. */
  q?: string;
};

/** Condición SQL de "cuándo": un rango por academia (cada una en su zona horaria) y por día pedido. */
async function whenCondition(when: NonNullable<DiscoverFilters['when']>, now: number, horizonDays: number) {
  const zones = await db
    .selectDistinct({ tz: schema.organizationDetail.timezone })
    .from(schema.organizationDetail)
    .where(eq(schema.organizationDetail.isPublished, true));
  const ranges: SQL[] = [];
  for (const { tz } of zones) {
    const today = localDate(now, tz);
    const days = new Set<string>();
    if (when.includes('today')) days.add(today);
    if (when.includes('tomorrow')) days.add(addDays(today, 1));
    if (when.includes('weekend')) {
      for (let i = 0; i <= horizonDays; i++) {
        const d = addDays(today, i);
        const wd = weekdayOf(d);
        if (wd === 6 || wd === 0) days.add(d);
      }
    }
    for (const d of days) {
      ranges.push(
        and(
          eq(schema.organizationDetail.timezone, tz),
          gte(schema.classSession.startsAt, new Date(zonedTimeToUtc(d, '00:00', tz))),
          lt(schema.classSession.startsAt, new Date(zonedTimeToUtc(addDays(d, 1), '00:00', tz)))
        )!
      );
    }
  }
  // Sin academias con zona conocida no puede haber coincidencias.
  return ranges.length ? or(...ranges) : sql`0`;
}

export async function discoverSessions(userId: string, opts: DiscoverFilters = {}) {
  const now = Date.now();
  const held = sql<number>`(select count(*) from waitlist_entry w where w.session_id = ${schema.classSession.id} and w.status = 'OFFERED' and w.offer_expires_at > ${now})`;
  const to = now + DISCOVER_DAYS * 24 * 3600_000;
  const booked = sql<number>`(select count(*) from booking b where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED')`;
  const mine = sql<
    string | null
  >`(select b.id from booking b join student st on st.id = b.student_id where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED' and st.user_id = ${userId} limit 1)`;
  // Se escapan % _ \ para que el texto se busque literal.
  const text = opts.q
    ?.trim()
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);

  const rows = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      capacity: schema.classSession.capacity,
      booked,
      held,
      mineBookingId: mine,
      serviceId: schema.service.id,
      serviceName: schema.service.name,
      kind: schema.service.kind,
      level: schema.service.level,
      priceCents: schema.service.priceCents,
      disciplineId: schema.service.disciplineId,
      disciplineName: schema.discipline.name,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      coverImage: schema.organizationDetail.coverImage,
      logo: schema.organization.logo,
      timezone: schema.organizationDetail.timezone,
      currency: schema.organizationDetail.currency,
      neighborhood: schema.location.neighborhood,
      city: schema.location.city,
      lat: schema.location.lat,
      lng: schema.location.lng,
      roomName: schema.room.name,
      instructorName: schema.user.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.classSession.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .innerJoin(schema.vertical, eq(schema.vertical.id, schema.organizationDetail.verticalId))
    .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .leftJoin(schema.location, and(eq(schema.location.organizationId, schema.organization.id), eq(schema.location.isPrimary, true)))
    .leftJoin(schema.user, eq(schema.user.id, schema.classSession.instructorUserId))
    .where(
      and(
        eq(schema.classSession.status, 'SCHEDULED'),
        gte(schema.classSession.startsAt, new Date(now)),
        lt(schema.classSession.startsAt, new Date(to)),
        eq(schema.service.isActive, true),
        eq(schema.organizationDetail.isPublished, true),
        eq(schema.vertical.isActive, true),
        opts.verticalId ? eq(schema.vertical.id, opts.verticalId) : undefined,
        opts.disciplineIds?.length ? inArray(schema.service.disciplineId, opts.disciplineIds) : undefined,
        // Una clase "para todos los niveles" sirve a cualquier nivel elegido.
        opts.levels?.length ? or(eq(schema.service.level, 'ALL'), inArray(schema.service.level, opts.levels)) : undefined,
        opts.onlyAvailable ? sql`${booked} + ${held} < ${schema.classSession.capacity}` : undefined,
        opts.when?.length ? await whenCondition(opts.when, now, DISCOVER_DAYS) : undefined,
        text
          ? sql`lower(${schema.service.name} || ' ' || ${schema.organization.name} || ' ' || coalesce(${schema.discipline.name}, '') || ' ' || coalesce(${schema.location.neighborhood}, '')) like ${`%${text}%`} escape '\\'`
          : undefined
      )
    )
    .orderBy(asc(schema.classSession.startsAt))
    .limit(200);
  // «Para ti»: las disciplinas que la persona eligió como intereses. Solo marca; el orden lo decide la pantalla.
  const mineIds = new Set(
    (await db.select({ id: schema.userInterest.disciplineId }).from(schema.userInterest).where(eq(schema.userInterest.userId, userId))).map(
      (i) => i.id
    )
  );
  return rows.map(({ held: h, ...r }) => ({ ...r, left: Math.max(0, r.capacity - r.booked - Number(h)), forYou: !!r.disciplineId && mineIds.has(r.disciplineId) }));
}

export async function discoverSession(userId: string, sessionId: string) {
  const all = await discoverSessionsById(userId, sessionId);
  return all;
}

async function discoverSessionsById(userId: string, sessionId: string) {
  const booked = sql<number>`(select count(*) from booking b where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED')`;
  const mine = sql<
    string | null
  >`(select b.id from booking b join student st on st.id = b.student_id where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED' and st.user_id = ${userId} limit 1)`;
  // Lugares apartados para OTRAS personas de la lista de espera (el propio, si lo hay, sí está disponible para quien lo tiene).
  const held = sql<number>`(select count(*) from waitlist_entry w where w.session_id = ${schema.classSession.id} and w.status = 'OFFERED' and w.offer_expires_at > ${Date.now()} and w.student_id not in (select st.id from student st where st.user_id = ${userId}))`;
  const [r] = await db
    .select({
      id: schema.classSession.id,
      status: schema.classSession.status,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      capacity: schema.classSession.capacity,
      booked,
      held,
      mineBookingId: mine,
      serviceName: schema.service.name,
      description: schema.service.description,
      kind: schema.service.kind,
      level: schema.service.level,
      durationMin: schema.service.durationMin,
      priceCents: schema.service.priceCents,
      disciplineName: schema.discipline.name,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      coverImage: schema.organizationDetail.coverImage,
      logo: schema.organization.logo,
      phone: schema.organizationDetail.phone,
      instagram: schema.organizationDetail.instagram,
      timezone: schema.organizationDetail.timezone,
      currency: schema.organizationDetail.currency,
      cancelWindowHours: schema.organizationDetail.cancelWindowHours,
      address: schema.location.address,
      neighborhood: schema.location.neighborhood,
      city: schema.location.city,
      mapsUrl: schema.location.mapsUrl,
      lat: schema.location.lat,
      lng: schema.location.lng,
      roomName: schema.room.name,
      instructorName: schema.user.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.classSession.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .leftJoin(schema.location, and(eq(schema.location.organizationId, schema.organization.id), eq(schema.location.isPrimary, true)))
    .leftJoin(schema.user, eq(schema.user.id, schema.classSession.instructorUserId))
    .where(and(eq(schema.classSession.id, sessionId), eq(schema.organizationDetail.isPublished, true)));
  if (!r) return null;
  const { held: h, ...rest } = r;
  return { ...rest, left: Math.max(0, r.capacity - r.booked - Number(h)) };
}

/** Minutos antes del inicio desde los que el alumno puede avisar que llegó (hasta que termina la clase). */
export const CHECKIN_WINDOW_MIN = 30;

/** Días después de la clase en que el alumno todavía puede decir «sí asistí» si la academia no lo registró. */
export const CLAIM_WINDOW_DAYS = 7;

export type CheckInFail = 'NOT_FOUND' | 'CANCELED' | 'TOO_EARLY' | 'ENDED' | 'CLOSED';

/**
 * El alumno avisa que llegó. NO es asistencia: solo deja una marca que la academia ve en su lista y confirma
 * (o que se confirma sola al cerrar la lista). Así nadie se acredita una clase ni gasta crédito por su cuenta.
 *
 * Si la clase ya terminó, es un «sí asistí»: sirve cuando la academia no pasó lista o lo dejó como falta, dentro de
 * `CLAIM_WINDOW_DAYS`. Tampoco cuenta hasta que la academia lo confirma (ni siquiera al cerrar la lista).
 */
export async function checkInBooking(userId: string, bookingId: string) {
  const row = await db
    .select({
      id: schema.booking.id,
      status: schema.booking.status,
      organizationId: schema.booking.organizationId,
      checkedInAt: schema.booking.checkedInAt,
      studentUserId: schema.student.userId,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      sessionStatus: schema.classSession.status,
      sessionId: schema.classSession.id,
      closedAt: schema.classSession.attendanceClosedAt,
      attendance: schema.attendance.status,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .leftJoin(schema.attendance, eq(schema.attendance.bookingId, schema.booking.id))
    .where(eq(schema.booking.id, bookingId))
    .get();
  if (!row || row.studentUserId !== userId) return { error: 'NOT_FOUND' as const };
  if (row.status !== 'CONFIRMED' || row.sessionStatus === 'CANCELED') return { error: 'CANCELED' as const };
  const now = Date.now();
  if (now < row.startsAt.getTime() - CHECKIN_WINDOW_MIN * 60_000) return { error: 'TOO_EARLY' as const };
  const ended = now > row.endsAt.getTime();
  if (ended && now > row.endsAt.getTime() + CLAIM_WINDOW_DAYS * 24 * 3600_000) return { error: 'ENDED' as const };
  if (!ended && row.closedAt) return { error: 'CLOSED' as const };
  // Ya confirmada, o ya avisada: nada que hacer (repetirlo no cambia nada).
  if (row.attendance === 'PRESENT' || row.checkedInAt) return { ok: true as const, checkedInAt: row.checkedInAt ?? new Date(now) };

  const at = new Date(now);
  await db.batch([
    db.update(schema.booking).set({ checkedInAt: at }).where(eq(schema.booking.id, bookingId)),
    auditStatement({
      organizationId: row.organizationId,
      actorUserId: userId,
      action: ended ? 'booking.attendance_claimed' : 'booking.checked_in',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { sessionId: row.sessionId },
    }),
  ] as Batch);
  return { ok: true as const, checkedInAt: at };
}

/** Reservas de la persona (en cualquier organización), próximas o pasadas. */
export async function listMyBookings(userId: string, scope: 'upcoming' | 'past', page: Page = { limit: 60, offset: 0 }, onlyId?: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: schema.booking.id,
      status: schema.booking.status,
      sessionId: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      sessionStatus: schema.classSession.status,
      serviceName: schema.service.name,
      priceCents: schema.service.priceCents,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      organizationLogo: schema.organization.logo,
      timezone: schema.organizationDetail.timezone,
      currency: schema.organizationDetail.currency,
      cancelWindowHours: schema.organizationDetail.cancelWindowHours,
      address: schema.location.address,
      neighborhood: schema.location.neighborhood,
      mapsUrl: schema.location.mapsUrl,
      roomName: schema.room.name,
      attendance: schema.attendance.status,
      checkedInAt: schema.booking.checkedInAt,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .leftJoin(schema.attendance, eq(schema.attendance.bookingId, schema.booking.id))
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .leftJoin(schema.location, and(eq(schema.location.organizationId, schema.organization.id), eq(schema.location.isPrimary, true)))
    .where(
      and(
        eq(schema.student.userId, userId),
        onlyId ? eq(schema.booking.id, onlyId) : undefined,
        onlyId
          ? undefined
          : scope === 'upcoming'
          ? and(eq(schema.booking.status, 'CONFIRMED'), gte(schema.classSession.startsAt, now), eq(schema.classSession.status, 'SCHEDULED'))
          : sql`(${schema.classSession.startsAt} < ${now.getTime()} or ${schema.booking.status} = 'CANCELED' or ${schema.classSession.status} = 'CANCELED')`
      )
    )
    .orderBy(scope === 'upcoming' ? asc(schema.classSession.startsAt) : sql`${schema.classSession.startsAt} desc`, asc(schema.booking.id))
    .limit(page.limit)
    .offset(page.offset);
  // Desde cuándo puede avisar que llegó (el cliente decide con su reloj si muestra el botón).
  return rows.map((r) => ({ ...r, checkInOpensAt: new Date(r.startsAt.getTime() - CHECKIN_WINDOW_MIN * 60_000) }));
}

/** Totales de mis reservas (no dependen de cuántas páginas se hayan cargado). */
export async function myBookingSummary(userId: string) {
  const [r] = await db
    .select({
      attended: sql<number>`count(distinct case when ${schema.attendance.status} = 'PRESENT' then ${schema.booking.id} end)`,
      orgs: sql<number>`count(distinct ${schema.booking.organizationId})`,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .leftJoin(schema.attendance, eq(schema.attendance.bookingId, schema.booking.id))
    .where(eq(schema.student.userId, userId));
  return { attended: Number(r?.attended ?? 0), orgs: Number(r?.orgs ?? 0) };
}

/**
 * Resumen de la persona como alumna: desde cuándo baila, en qué academias, cuántas clases y horas lleva, qué disciplinas
 * practica y sus últimas clases. Todo sale de las reservas y la asistencia que ya se guardan (nada se calcula aparte), y
 * junta TODOS sus registros de alumno (una persona puede ser alumna de varias academias, también los que se vincularon
 * después con un código).
 */
export async function myProfileSummary(userId: string) {
  const now = Date.now();
  const students = await db
    .select({
      id: schema.student.id,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      logo: schema.organization.logo,
      timezone: schema.organizationDetail.timezone,
      level: schema.student.level,
      since: schema.student.createdAt,
    })
    .from(schema.student)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.student.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .where(eq(schema.student.userId, userId));
  if (!students.length) return { since: null, attended: 0, missed: 0, minutes: 0, last30: 0, attendanceRate: null, organizations: [], disciplines: [], recent: [] };
  const ids = students.map((s) => s.id);

  const rows = await db
    .select({
      studentId: schema.attendance.studentId,
      status: schema.attendance.status,
      startsAt: schema.classSession.startsAt,
      minutes: schema.service.durationMin,
      service: schema.service.name,
      discipline: schema.discipline.name,
    })
    .from(schema.attendance)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.attendance.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
    .where(and(inArray(schema.attendance.studentId, ids), inArray(schema.attendance.status, ['PRESENT', 'ABSENT'])))
    .orderBy(sql`${schema.classSession.startsAt} desc`)
    .limit(5000);

  const upcoming = await db
    .select({ studentId: schema.booking.studentId, n: sql<number>`count(*)` })
    .from(schema.booking)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .where(and(inArray(schema.booking.studentId, ids), eq(schema.booking.status, 'CONFIRMED'), eq(schema.classSession.status, 'SCHEDULED'), gte(schema.classSession.startsAt, new Date(now))))
    .groupBy(schema.booking.studentId);
  const upcomingBy = new Map(upcoming.map((u) => [u.studentId, Number(u.n)]));

  const present = rows.filter((r) => r.status === 'PRESENT');
  const missed = rows.length - present.length;
  const orgs = students
    .map((s) => {
      const mine = present.filter((r) => r.studentId === s.id);
      const times = mine.map((r) => r.startsAt.getTime());
      return {
        organizationId: s.organizationId,
        name: s.organizationName,
        logo: s.logo,
        timezone: s.timezone,
        level: s.level,
        // «Alumna desde»: el primero entre el alta en la academia y su primera clase (el alta puede ser posterior si la vinculó después).
        since: new Date(Math.min(s.since.getTime(), ...(times.length ? [Math.min(...times)] : []))),
        attended: mine.length,
        minutes: mine.reduce((a, r) => a + r.minutes, 0),
        lastClassAt: times.length ? new Date(Math.max(...times)) : null,
        upcoming: upcomingBy.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => b.attended - a.attended || a.since.getTime() - b.since.getTime());

  const byDiscipline = new Map<string, { classes: number; minutes: number }>();
  for (const r of present) {
    const k = r.discipline ?? r.service;
    const cur = byDiscipline.get(k) ?? { classes: 0, minutes: 0 };
    byDiscipline.set(k, { classes: cur.classes + 1, minutes: cur.minutes + r.minutes });
  }
  const dayMs = 24 * 3600_000;
  return {
    since: new Date(Math.min(...orgs.map((o) => o.since.getTime()))),
    attended: present.length,
    missed,
    minutes: present.reduce((a, r) => a + r.minutes, 0),
    last30: present.filter((r) => now - r.startsAt.getTime() <= 30 * dayMs).length,
    // Solo cuenta clases ya calificadas por la academia (asistió o faltó): «sin registro» no pesa en contra.
    attendanceRate: rows.length ? Math.round((present.length / rows.length) * 100) : null,
    organizations: orgs,
    disciplines: [...byDiscipline.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.classes - a.classes)
      .slice(0, 6),
    recent: present.slice(0, 5).map((r) => {
      const st = students.find((x) => x.id === r.studentId)!;
      return { service: r.service, startsAt: r.startsAt, organizationName: st.organizationName, timezone: st.timezone ?? 'America/Mexico_City' };
    }),
  };
}

/** Una reserva propia por id (el detalle no depende de la página de la lista en que caiga). */
export async function getMyBooking(userId: string, bookingId: string) {
  return (await listMyBookings(userId, 'past', { limit: 1, offset: 0 }, bookingId))[0] ?? null;
}

/* ── Academias (perfil público) ───────────────────────────────────────────── */

/** Organizaciones publicadas con lo necesario para listarlas y ubicarlas en el mapa. */
export async function discoverOrgs() {
  const now = Date.now();
  const to = now + DISCOVER_DAYS * 24 * 3600_000;
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      type: schema.organizationDetail.type,
      description: schema.organizationDetail.description,
      coverImage: schema.organizationDetail.coverImage,
      logo: schema.organization.logo,
      verticalName: schema.vertical.name,
      neighborhood: schema.location.neighborhood,
      city: schema.location.city,
      address: schema.location.address,
      lat: schema.location.lat,
      lng: schema.location.lng,
    })
    .from(schema.organization)
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .innerJoin(schema.vertical, eq(schema.vertical.id, schema.organizationDetail.verticalId))
    .leftJoin(schema.location, and(eq(schema.location.organizationId, schema.organization.id), eq(schema.location.isPrimary, true)))
    .where(and(eq(schema.organizationDetail.isPublished, true), eq(schema.vertical.isActive, true)))
    .orderBy(asc(schema.organization.name));

  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const [services, upcoming] = await Promise.all([
    db
      .select({ organizationId: schema.service.organizationId, discipline: schema.discipline.name })
      .from(schema.service)
      .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
      .where(and(inArray(schema.service.organizationId, ids), eq(schema.service.isActive, true))),
    db
      .select({
        organizationId: schema.classSession.organizationId,
        n: sql<number>`count(*)`,
        next: sql<number>`min(${schema.classSession.startsAt})`,
      })
      .from(schema.classSession)
      .where(
        and(
          inArray(schema.classSession.organizationId, ids),
          eq(schema.classSession.status, 'SCHEDULED'),
          gte(schema.classSession.startsAt, new Date(now)),
          lt(schema.classSession.startsAt, new Date(to))
        )
      )
      .groupBy(schema.classSession.organizationId),
  ]);
  const disciplines = new Map<string, Set<string>>();
  for (const s of services)
    if (s.discipline)
      (disciplines.get(s.organizationId) ?? disciplines.set(s.organizationId, new Set()).get(s.organizationId)!).add(s.discipline);
  const counts = new Map(upcoming.map((u) => [u.organizationId, u]));
  return orgs.map((o) => ({
    ...o,
    disciplines: [...(disciplines.get(o.id) ?? [])],
    upcomingSessions: counts.get(o.id)?.n ?? 0,
  }));
}

/** Perfil público de una academia: información, ubicación, servicios, equipo y próximas sesiones. */
export async function discoverOrg(userId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      type: schema.organizationDetail.type,
      description: schema.organizationDetail.description,
      phone: schema.organizationDetail.phone,
      instagram: schema.organizationDetail.instagram,
      website: schema.organizationDetail.website,
      coverImage: schema.organizationDetail.coverImage,
      logo: schema.organization.logo,
      timezone: schema.organizationDetail.timezone,
      currency: schema.organizationDetail.currency,
      cancelWindowHours: schema.organizationDetail.cancelWindowHours,
      verticalName: schema.vertical.name,
      terms: schema.vertical.terms,
      address: schema.location.address,
      neighborhood: schema.location.neighborhood,
      city: schema.location.city,
      mapsUrl: schema.location.mapsUrl,
      lat: schema.location.lat,
      lng: schema.location.lng,
    })
    .from(schema.organization)
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .innerJoin(schema.vertical, eq(schema.vertical.id, schema.organizationDetail.verticalId))
    .leftJoin(schema.location, and(eq(schema.location.organizationId, schema.organization.id), eq(schema.location.isPrimary, true)))
    .where(and(eq(schema.organization.id, organizationId), eq(schema.organizationDetail.isPublished, true)));
  if (!row) return null;

  const [services, team, sessions] = await Promise.all([
    db
      .select({
        id: schema.service.id,
        name: schema.service.name,
        description: schema.service.description,
        kind: schema.service.kind,
        level: schema.service.level,
        priceCents: schema.service.priceCents,
        durationMin: schema.service.durationMin,
        disciplineName: schema.discipline.name,
      })
      .from(schema.service)
      .leftJoin(schema.discipline, eq(schema.discipline.id, schema.service.disciplineId))
      .where(and(eq(schema.service.organizationId, organizationId), eq(schema.service.isActive, true)))
      .orderBy(asc(schema.service.name)),
    // Solo nombres de quienes imparten: no se exponen correos ni teléfonos del equipo.
    db
      .select({ name: schema.user.name, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.organizationId, organizationId), inArray(schema.member.userId, [...(await teachingUserIds(organizationId)), '-']))),
    discoverSessionsOf(userId, organizationId),
  ]);

  return { ...row, terms: parseTerms(row.terms), services, team, sessions };
}

async function discoverSessionsOf(userId: string, organizationId: string) {
  const now = Date.now();
  const booked = sql<number>`(select count(*) from booking b where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED')`;
  const held = sql<number>`(select count(*) from waitlist_entry w where w.session_id = ${schema.classSession.id} and w.status = 'OFFERED' and w.offer_expires_at > ${now})`;
  const mine = sql<
    string | null
  >`(select b.id from booking b join student st on st.id = b.student_id where b.session_id = ${schema.classSession.id} and b.status = 'CONFIRMED' and st.user_id = ${userId} limit 1)`;
  const rows = await db
    .select({
      id: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      endsAt: schema.classSession.endsAt,
      capacity: schema.classSession.capacity,
      booked,
      held,
      mineBookingId: mine,
      serviceName: schema.service.name,
      priceCents: schema.service.priceCents,
      roomName: schema.room.name,
      instructorName: schema.user.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .leftJoin(schema.user, eq(schema.user.id, schema.classSession.instructorUserId))
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        eq(schema.classSession.status, 'SCHEDULED'),
        eq(schema.service.isActive, true),
        gte(schema.classSession.startsAt, new Date(now)),
        lt(schema.classSession.startsAt, new Date(now + 21 * 24 * 3600_000))
      )
    )
    .orderBy(asc(schema.classSession.startsAt))
    .limit(80);
  return rows.map(({ held: h, ...r }) => ({ ...r, left: Math.max(0, r.capacity - r.booked - Number(h)) }));
}
