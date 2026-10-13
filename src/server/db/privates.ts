import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { addDays, isTime, localDate, zonedTimeToUtc } from '../lib/time';
import { bookAsUser } from './bookings';
import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Cuánto se puede reservar por adelantado y con cuánta anticipación mínima. */
const HORIZON_DAYS = 14;
const MIN_LEAD_MS = 2 * 3600_000;

export type Window = { weekday: number; startTime: string; endTime: string };

/* ── Disponibilidad de quien imparte ──────────────────────────────────────── */

export async function getAvailability(organizationId: string, userId: string) {
  const rows = await db
    .select({
      weekday: schema.instructorAvailability.weekday,
      startTime: schema.instructorAvailability.startTime,
      endTime: schema.instructorAvailability.endTime,
    })
    .from(schema.instructorAvailability)
    .where(and(eq(schema.instructorAvailability.organizationId, organizationId), eq(schema.instructorAvailability.userId, userId)))
    .orderBy(asc(schema.instructorAvailability.weekday), asc(schema.instructorAvailability.startTime));
  return rows;
}

/** Reemplaza TODA la disponibilidad de la persona en la organización. */
export async function setAvailability(actorId: string, organizationId: string, userId: string, windows: Window[]) {
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  for (const [i, w] of sorted.entries()) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6 || !isTime(w.startTime) || !isTime(w.endTime))
      return { error: 'INVALID' as const, reason: 'Revisa los días y las horas.' };
    if (w.startTime >= w.endTime) return { error: 'INVALID' as const, reason: 'La hora de fin debe ser posterior a la de inicio.' };
    const prev = sorted[i - 1];
    if (prev && prev.weekday === w.weekday && prev.endTime > w.startTime)
      return { error: 'INVALID' as const, reason: 'Hay horarios que se empalman el mismo día.' };
  }
  const where = and(eq(schema.instructorAvailability.organizationId, organizationId), eq(schema.instructorAvailability.userId, userId));
  const statements: BatchItem<'sqlite'>[] = [db.delete(schema.instructorAvailability).where(where)];
  if (sorted.length)
    statements.push(db.insert(schema.instructorAvailability).values(sorted.map((w) => ({ ...w, organizationId, userId }))));
  statements.push(
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'availability.updated',
      entityType: 'user',
      entityId: userId,
      metadata: { windows: sorted.length },
    })
  );
  await db.batch(statements as Batch);
  return { ok: true as const };
}

/* ── Horarios reservables ─────────────────────────────────────────────────── */

async function privateService(serviceId: string) {
  const [row] = await db
    .select({
      id: schema.service.id,
      organizationId: schema.service.organizationId,
      name: schema.service.name,
      priceCents: schema.service.priceCents,
      durationMin: schema.service.durationMin,
      bufferMin: schema.service.bufferMin,
      instructorUserId: schema.service.instructorUserId,
      timezone: schema.organizationDetail.timezone,
      currency: schema.organizationDetail.currency,
    })
    .from(schema.service)
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.service.organizationId))
    .where(
      and(
        eq(schema.service.id, serviceId),
        eq(schema.service.kind, 'PRIVATE'),
        eq(schema.service.isActive, true),
        eq(schema.organizationDetail.isPublished, true)
      )
    );
  return row && row.instructorUserId ? { ...row, instructorUserId: row.instructorUserId } : null;
}

/** Inicios (UTC ms) en que cabe una sesión de este servicio, agrupados por día local. */
export async function listSlots(serviceId: string) {
  const svc = await privateService(serviceId);
  if (!svc) return null;
  const now = Date.now();
  const today = localDate(now, svc.timezone);
  const lastDay = addDays(today, HORIZON_DAYS);
  const windows = await getAvailability(svc.organizationId, svc.instructorUserId);
  const rangeStart = zonedTimeToUtc(today, '00:00', svc.timezone);
  const rangeEnd = zonedTimeToUtc(addDays(lastDay, 1), '00:00', svc.timezone);

  // Sesiones de esa persona (de cualquier servicio) que ocupan tiempo en el rango.
  const busy = await db
    .select({ startsAt: schema.classSession.startsAt, endsAt: schema.classSession.endsAt })
    .from(schema.classSession)
    .where(
      and(
        eq(schema.classSession.instructorUserId, svc.instructorUserId),
        eq(schema.classSession.status, 'SCHEDULED'),
        lt(schema.classSession.startsAt, new Date(rangeEnd)),
        gt(schema.classSession.endsAt, new Date(rangeStart))
      )
    );

  const dur = svc.durationMin * 60_000;
  const buf = svc.bufferMin * 60_000;
  const days: { date: string; slots: number[] }[] = [];
  for (let date = today; date <= lastDay; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const slots: number[] = [];
    for (const w of windows.filter((x) => x.weekday === weekday)) {
      const winEnd = zonedTimeToUtc(date, w.endTime, svc.timezone);
      for (let start = zonedTimeToUtc(date, w.startTime, svc.timezone); start + dur <= winEnd; start += dur + buf) {
        if (start < now + MIN_LEAD_MS) continue;
        if (busy.some((b) => b.startsAt.getTime() < start + dur + buf && b.endsAt.getTime() > start - buf)) continue;
        slots.push(start);
      }
    }
    if (slots.length) days.push({ date, slots });
  }
  return {
    service: { id: svc.id, name: svc.name, priceCents: svc.priceCents, durationMin: svc.durationMin, currency: svc.currency },
    timezone: svc.timezone,
    days,
  };
}

/**
 * Reserva un horario de una privada: crea la sesión (cupo 1) y la reserva de la persona. El choque con otra
 * sesión de quien imparte se verifica EN la misma sentencia que inserta, así dos personas no toman el mismo horario.
 */
export async function bookPrivateSlot(u: { id: string; name: string; email: string }, serviceId: string, startsAtMs: number) {
  const svc = await privateService(serviceId);
  if (!svc) return { error: 'NOT_FOUND' as const };
  // Solo se acepta un inicio que el sistema ofrecería (disponibilidad, anticipación, sin empalmes).
  const offered = await listSlots(serviceId);
  if (!offered?.days.some((d) => d.slots.includes(startsAtMs))) return { error: 'SLOT_UNAVAILABLE' as const };

  const sessionId = crypto.randomUUID();
  const endsAtMs = startsAtMs + svc.durationMin * 60_000;
  const buf = svc.bufferMin * 60_000;
  const res = await db.run(sql`
    INSERT INTO class_session (id, organization_id, service_id, instructor_user_id, starts_at, ends_at, capacity, status, created_at)
    SELECT ${sessionId}, ${svc.organizationId}, ${svc.id}, ${svc.instructorUserId}, ${startsAtMs}, ${endsAtMs}, 1, 'SCHEDULED', ${Date.now()}
    WHERE NOT EXISTS (
      SELECT 1 FROM class_session c
      WHERE c.instructor_user_id = ${svc.instructorUserId} AND c.status = 'SCHEDULED'
        AND c.starts_at < ${endsAtMs + buf} AND c.ends_at > ${startsAtMs - buf})`);
  if (res.rowsAffected === 0) return { error: 'SLOT_UNAVAILABLE' as const };

  const booked = await bookAsUser(u, sessionId);
  if ('error' in booked) {
    await db.delete(schema.classSession).where(eq(schema.classSession.id, sessionId));
    return { error: 'SLOT_UNAVAILABLE' as const };
  }
  return { bookingId: booked.id, sessionId, startsAt: new Date(startsAtMs) };
}
