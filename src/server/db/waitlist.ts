import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import { reportError } from '../lib/report';
import { describeSession, notify } from './notifications';
import { db, schema } from './index';

const MIN = 60_000;
/** Cuánto se aparta un lugar para quien sigue en la fila, como máximo. */
const MAX_HOLD_MS = 2 * 60 * MIN;
/** Si la clase empieza en menos de esto, ya no se ofrece (no daría tiempo de decidir y llegar). */
const MIN_HOLD_MS = 10 * MIN;

type Session = typeof schema.classSession.$inferSelect;

/** Lugares apartados (ofrecidos y vigentes) en una sesión. */
const heldCount = (sessionId: string, now: number) =>
  sql`(select count(*) from waitlist_entry w where w.session_id = ${sessionId} and w.status = 'OFFERED' and w.offer_expires_at > ${now})`;
const confirmedCount = (sessionId: string) => sql`(select count(*) from booking b where b.session_id = ${sessionId} and b.status = 'CONFIRMED')`;

async function one(q: ReturnType<typeof sql>): Promise<number> {
  const r = await db.run(sql`select ${q} as n`);
  return Number((r.rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
}

/* ── Alumno ───────────────────────────────────────────────────────────────── */

export type JoinFail = 'NOT_BOOKABLE' | 'NOT_FULL' | 'ALREADY_BOOKED' | 'ALREADY_WAITING';

/** Entrar a la fila de una sesión llena. Si todavía hay lugar, se pide reservar directo. */
export async function joinWaitlist(u: { id: string; name: string; email: string }, sessionId: string) {
  const now = Date.now();
  const s = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, sessionId) });
  if (!s || s.status !== 'SCHEDULED' || s.startsAt.getTime() <= now) return { error: 'NOT_BOOKABLE' as const };
  const pub = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, s.organizationId) });
  if (!pub?.isPublished) return { error: 'NOT_BOOKABLE' as const };
  // Import diferido: `bookings` importa este módulo (evita un ciclo al cargar).
  const { ensureStudentForUser } = await import('./bookings');
  const studentId = await ensureStudentForUser(s.organizationId, u);

  const mine = await db.query.booking.findFirst({
    where: and(eq(schema.booking.sessionId, sessionId), eq(schema.booking.studentId, studentId), eq(schema.booking.status, 'CONFIRMED')),
  });
  if (mine) return { error: 'ALREADY_BOOKED' as const };
  // Primero se limpian ofertas vencidas: un lugar vencido no cuenta como ocupado.
  await settleWaitlist(sessionId, now);
  const free = s.capacity - (await one(confirmedCount(sessionId))) - (await one(heldCount(sessionId, now)));
  if (free > 0) return { error: 'NOT_FULL' as const };

  try {
    await db.insert(schema.waitlistEntry).values({ organizationId: s.organizationId, sessionId, studentId });
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE') || String((e as { cause?: Error }).cause?.message).includes('UNIQUE')) return { error: 'ALREADY_WAITING' as const };
    throw e;
  }
  // Si en medio se liberó un lugar, la fila avanza ya (puede tocarle a esta misma persona).
  await promoteWaitlist(sessionId, now);
  return { ok: true as const, ...(await waitlistFor(u.id, sessionId)) };
}

/** Salir de la fila (o rechazar el lugar que se ofreció). Si tenía un lugar apartado, pasa al siguiente. */
export async function leaveWaitlist(userId: string, sessionId: string) {
  const entries = await db
    .select({ id: schema.waitlistEntry.id, status: schema.waitlistEntry.status })
    .from(schema.waitlistEntry)
    .innerJoin(schema.student, eq(schema.student.id, schema.waitlistEntry.studentId))
    .where(and(eq(schema.waitlistEntry.sessionId, sessionId), eq(schema.student.userId, userId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])));
  if (!entries.length) return { error: 'NOT_FOUND' as const };
  await db.update(schema.waitlistEntry).set({ status: 'CANCELED' }).where(inArray(schema.waitlistEntry.id, entries.map((e) => e.id)));
  if (entries.some((e) => e.status === 'OFFERED')) await promoteWaitlist(sessionId);
  return { ok: true as const };
}

/** Mi lugar en la fila de una sesión: estado, posición y hasta cuándo está apartado. */
export async function waitlistFor(userId: string, sessionId: string, now = Date.now()) {
  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.waitlistEntry)
    .where(and(eq(schema.waitlistEntry.sessionId, sessionId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])));
  const [mine] = await db
    .select({ id: schema.waitlistEntry.id, status: schema.waitlistEntry.status, createdAt: schema.waitlistEntry.createdAt, expiresAt: schema.waitlistEntry.offerExpiresAt })
    .from(schema.waitlistEntry)
    .innerJoin(schema.student, eq(schema.student.id, schema.waitlistEntry.studentId))
    .where(and(eq(schema.waitlistEntry.sessionId, sessionId), eq(schema.student.userId, userId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])));
  if (!mine) return { count: Number(count?.n ?? 0), status: null, position: null, offerExpiresAt: null };
  // Una oferta vencida todavía no limpiada se ve como lo que es: ya no hay lugar apartado.
  const live = mine.status === 'OFFERED' && !!mine.expiresAt && mine.expiresAt.getTime() > now;
  const ahead = await one(
    sql`(select count(*) from waitlist_entry w where w.session_id = ${sessionId} and w.status in ('WAITING','OFFERED') and (w.created_at < ${mine.createdAt.getTime()} or (w.created_at = ${mine.createdAt.getTime()} and w.id < ${mine.id})))`
  );
  return { count: Number(count?.n ?? 0), status: live ? ('OFFERED' as const) : ('WAITING' as const), position: ahead + 1, offerExpiresAt: live ? mine.expiresAt : null };
}

/** Todas mis filas activas (próximas sesiones), con la clase y la academia. */
export async function myWaitlist(userId: string) {
  const now = Date.now();
  const rows = await db
    .select({
      entryId: schema.waitlistEntry.id,
      status: schema.waitlistEntry.status,
      offerExpiresAt: schema.waitlistEntry.offerExpiresAt,
      sessionId: schema.classSession.id,
      startsAt: schema.classSession.startsAt,
      service: schema.service.name,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      organizationLogo: schema.organization.logo,
      timezone: schema.organizationDetail.timezone,
    })
    .from(schema.waitlistEntry)
    .innerJoin(schema.student, eq(schema.student.id, schema.waitlistEntry.studentId))
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.waitlistEntry.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.waitlistEntry.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .where(
      and(
        eq(schema.student.userId, userId),
        inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED']),
        eq(schema.classSession.status, 'SCHEDULED'),
        sql`${schema.classSession.startsAt} > ${now}`
      )
    )
    .orderBy(asc(schema.classSession.startsAt))
    .limit(50);
  const out = [];
  for (const r of rows) {
    const w = await waitlistFor(userId, r.sessionId, now);
    out.push({ ...r, status: w.status ?? r.status, position: w.position, offerExpiresAt: w.offerExpiresAt });
  }
  return out;
}

/* ── Academia ─────────────────────────────────────────────────────────────── */

/** La fila de una sesión, para el equipo: quién espera, en qué orden y a quién se le apartó el lugar. */
export async function sessionWaitlist(organizationId: string, sessionId: string) {
  const now = Date.now();
  const rows = await db
    .select({
      id: schema.waitlistEntry.id,
      status: schema.waitlistEntry.status,
      offerExpiresAt: schema.waitlistEntry.offerExpiresAt,
      createdAt: schema.waitlistEntry.createdAt,
      studentName: schema.student.name,
      studentImage: schema.user.image,
    })
    .from(schema.waitlistEntry)
    .innerJoin(schema.student, eq(schema.student.id, schema.waitlistEntry.studentId))
    .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
    .where(and(eq(schema.waitlistEntry.organizationId, organizationId), eq(schema.waitlistEntry.sessionId, sessionId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])))
    .orderBy(asc(schema.waitlistEntry.createdAt), asc(schema.waitlistEntry.id));
  return rows.map((r, i) => ({
    id: r.id,
    name: r.studentName,
    image: r.studentImage,
    position: i + 1,
    // Oferta vencida aún sin limpiar: se muestra como en espera.
    status: r.status === 'OFFERED' && r.offerExpiresAt && r.offerExpiresAt.getTime() > now ? ('OFFERED' as const) : ('WAITING' as const),
    offerExpiresAt: r.status === 'OFFERED' && r.offerExpiresAt && r.offerExpiresAt.getTime() > now ? r.offerExpiresAt : null,
  }));
}

/** Quitar a alguien de la fila (recepción). Si tenía el lugar apartado, pasa al siguiente. */
export async function removeFromWaitlist(organizationId: string, entryId: string) {
  const e = await db.query.waitlistEntry.findFirst({
    where: and(eq(schema.waitlistEntry.id, entryId), eq(schema.waitlistEntry.organizationId, organizationId), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])),
  });
  if (!e) return { error: 'NOT_FOUND' as const };
  await db.update(schema.waitlistEntry).set({ status: 'CANCELED' }).where(eq(schema.waitlistEntry.id, entryId));
  if (e.status === 'OFFERED') await promoteWaitlist(e.sessionId);
  return { ok: true as const };
}

/* ── Motor: ofrecer lugares ───────────────────────────────────────────────── */

/**
 * Ofrece los lugares libres a los primeros de la fila, en UNA sola sentencia (la cuenta de lugares libres y el cambio de
 * estado no se pueden separar: dos cancelaciones a la vez nunca ofrecen de más). Avisa a cada persona.
 */
export async function promoteWaitlist(sessionId: string, now = Date.now()) {
  const s = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, sessionId) });
  if (!s || s.status !== 'SCHEDULED') return 0;
  const hold = Math.min(MAX_HOLD_MS, s.startsAt.getTime() - now - MIN_HOLD_MS);
  if (hold < MIN_HOLD_MS) return 0;
  const expires = now + hold;

  const res = await db.run(sql`
    UPDATE waitlist_entry SET status = 'OFFERED', offered_at = ${now}, offer_expires_at = ${expires}
    WHERE status = 'WAITING' AND id IN (
      SELECT w.id FROM waitlist_entry w
      WHERE w.session_id = ${sessionId} AND w.status = 'WAITING'
      ORDER BY w.created_at, w.id
      LIMIT max(0, coalesce((SELECT capacity FROM class_session WHERE id = ${sessionId} AND status = 'SCHEDULED'), 0)
        - (SELECT count(*) FROM booking b WHERE b.session_id = ${sessionId} AND b.status = 'CONFIRMED')
        - (SELECT count(*) FROM waitlist_entry o WHERE o.session_id = ${sessionId} AND o.status = 'OFFERED' AND o.offer_expires_at > ${now}))
    )
    RETURNING student_id`);
  const studentIds = res.rows.map((r) => String((r as unknown as { student_id: string }).student_id));
  if (!studentIds.length) return 0;

  const d = await describeSession(sessionId);
  const users = await db.select({ userId: schema.student.userId }).from(schema.student).where(inArray(schema.student.id, studentIds));
  const minutes = Math.max(1, Math.round(hold / MIN));
  const holdText = minutes >= 90 ? `${Math.round(minutes / 60)} horas` : `${minutes} minutos`;
  if (d)
    await Promise.allSettled(
      users
        .filter((u) => u.userId)
        .map((u) =>
          notify(u.userId!, {
            category: 'class',
            organizationId: d.organizationId,
            title: 'Se liberó un lugar',
            body: `${d.service} · ${d.when} · ${d.org}. Es tuyo durante ${holdText}: tómalo antes de que pase al siguiente.`,
            url: `/class/${sessionId}`,
          })
        )
    );
  return studentIds.length;
}

/** Vence las ofertas que ya pasaron de tiempo en una sesión y ofrece esos lugares al siguiente de la fila. */
export async function settleWaitlist(sessionId: string, now = Date.now()) {
  const stale = await db
    .update(schema.waitlistEntry)
    .set({ status: 'EXPIRED' })
    .where(and(eq(schema.waitlistEntry.sessionId, sessionId), eq(schema.waitlistEntry.status, 'OFFERED'), lt(schema.waitlistEntry.offerExpiresAt, new Date(now + 1))))
    .returning({ studentId: schema.waitlistEntry.studentId });
  const offered = await promoteWaitlist(sessionId, now);
  if (stale.length) {
    const users = await db.select({ userId: schema.student.userId }).from(schema.student).where(inArray(schema.student.id, stale.map((x) => x.studentId)));
    const d = await describeSession(sessionId);
    if (d)
      await Promise.allSettled(
        users.filter((u) => u.userId).map((u) => notify(u.userId!, { category: 'class', organizationId: d.organizationId, title: 'Se venció tu lugar', body: `${d.service} · ${d.when}: pasó al siguiente de la lista.`, url: `/class/${sessionId}` }))
      );
  }
  return offered;
}

/**
 * Mantenimiento (lo corre el planificador cada ~10 min): vence ofertas, ofrece lugares y cierra las filas de clases que
 * ya empezaron. Nunca lanza.
 */
export async function runWaitlistMaintenance(now = Date.now()) {
  try {
    const sessions = await db
      .selectDistinct({ id: schema.waitlistEntry.sessionId })
      .from(schema.waitlistEntry)
      .where(or(and(eq(schema.waitlistEntry.status, 'OFFERED'), lt(schema.waitlistEntry.offerExpiresAt, new Date(now + 1))), eq(schema.waitlistEntry.status, 'WAITING')));
    let offered = 0;
    for (const s of sessions) offered += await settleWaitlist(s.id, now);
    // Clases que ya empezaron: la fila ya no sirve.
    await db.run(sql`UPDATE waitlist_entry SET status = 'EXPIRED' WHERE status IN ('WAITING','OFFERED') AND session_id IN (SELECT id FROM class_session WHERE starts_at <= ${now})`);
    return { offered };
  } catch (e) {
    reportError(e, { source: 'waitlist', level: 'warning' });
    return { offered: 0 };
  }
}

/** Una sesión se canceló: la fila se cierra y se avisa a quien esperaba. */
export async function closeWaitlistForCanceled(sessionIds: string[]) {
  if (!sessionIds.length) return;
  const entries = await db
    .select({ id: schema.waitlistEntry.id, sessionId: schema.waitlistEntry.sessionId, userId: schema.student.userId })
    .from(schema.waitlistEntry)
    .innerJoin(schema.student, eq(schema.student.id, schema.waitlistEntry.studentId))
    .where(and(inArray(schema.waitlistEntry.sessionId, sessionIds), inArray(schema.waitlistEntry.status, ['WAITING', 'OFFERED'])));
  if (!entries.length) return;
  await db.update(schema.waitlistEntry).set({ status: 'CANCELED' }).where(inArray(schema.waitlistEntry.id, entries.map((e) => e.id)));
  await Promise.allSettled(
    entries
      .filter((e) => e.userId)
      .map(async (e) => {
        const d = await describeSession(e.sessionId);
        if (d) await notify(e.userId!, { category: 'class', organizationId: d.organizationId, title: `${d.org} canceló la clase`, body: `${d.service} · ${d.when}. Ya no hay lista de espera.`, url: '/my-classes' });
      })
  );
}

export type { Session };
