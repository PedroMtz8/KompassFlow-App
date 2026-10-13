import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

const TTL_MS = 7 * 24 * 3600_000;
// Sin caracteres que se confunden al dictarlos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Genera un código para un alumno sin cuenta. Invalida los anteriores que siguieran vigentes. */
export async function createLinkCode(actorId: string, organizationId: string, studentId: string) {
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.id, studentId), eq(schema.student.organizationId, organizationId)),
  });
  if (!st) return { error: 'NOT_FOUND' as const };
  if (st.userId) return { error: 'ALREADY_LINKED' as const };
  const code = newCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.batch([
    db
      .update(schema.studentLinkCode)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.studentLinkCode.studentId, studentId), isNull(schema.studentLinkCode.usedAt))),
    db
      .insert(schema.studentLinkCode)
      .values({ organizationId, studentId, codeHash: await sha256(normalize(code)), expiresAt, createdBy: actorId }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'student.link_code_created',
      entityType: 'student',
      entityId: studentId,
    }),
  ] as Batch);
  return { code, expiresAt };
}

/**
 * La persona canjea el código con su cuenta. Si ya tenía un registro propio en esa organización
 * (porque reservó desde la app), se fusionan: el historial del alumno de recepción pasa al registro con cuenta.
 */
export async function redeemLinkCode(user: { id: string }, codeRaw: string) {
  const hash = await sha256(normalize(codeRaw));
  const row = await db.query.studentLinkCode.findFirst({
    where: and(
      eq(schema.studentLinkCode.codeHash, hash),
      isNull(schema.studentLinkCode.usedAt),
      gt(schema.studentLinkCode.expiresAt, new Date())
    ),
  });
  if (!row) return { error: 'INVALID_CODE' as const };
  const st = await db.query.student.findFirst({ where: eq(schema.student.id, row.studentId) });
  if (!st || st.userId) return { error: 'INVALID_CODE' as const };
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, row.organizationId) });

  // Consumir el código primero: con dos canjes simultáneos solo uno actualiza la fila.
  const claimed = await db
    .update(schema.studentLinkCode)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.studentLinkCode.id, row.id), isNull(schema.studentLinkCode.usedAt)))
    .returning({ id: schema.studentLinkCode.id });
  if (!claimed.length) return { error: 'INVALID_CODE' as const };

  const own = await db.query.student.findFirst({
    where: and(eq(schema.student.organizationId, row.organizationId), eq(schema.student.userId, user.id)),
  });
  const audit = auditStatement({
    organizationId: row.organizationId,
    actorUserId: user.id,
    action: 'student.linked',
    entityType: 'student',
    entityId: st.id,
    metadata: { merged: !!own },
  });

  if (!own) {
    await db.batch([
      db
        .update(schema.student)
        .set({ userId: user.id })
        .where(and(eq(schema.student.id, st.id), isNull(schema.student.userId))),
      audit,
    ] as Batch);
    return { ok: true as const, studentId: st.id, studentName: st.name, organizationName: org?.name ?? '', merged: false };
  }

  // Fusión: las reservas duplicadas de una misma sesión se cancelan en el registro de recepción.
  await db.batch([
    db
      .update(schema.booking)
      .set({ status: 'CANCELED', canceledAt: new Date(), cancelReason: 'Fusión de registros' })
      .where(
        and(
          eq(schema.booking.studentId, st.id),
          eq(schema.booking.status, 'CONFIRMED'),
          sql`${schema.booking.sessionId} in (select session_id from booking where student_id = ${own.id} and status = 'CONFIRMED')`
        )
      ),
    db.update(schema.booking).set({ studentId: own.id }).where(eq(schema.booking.studentId, st.id)),
    db.update(schema.attendance).set({ studentId: own.id }).where(eq(schema.attendance.studentId, st.id)),
    // Datos de contacto que el registro con cuenta no tenga.
    db
      .update(schema.student)
      .set({ phone: own.phone ?? st.phone, level: own.level === 'NEW' ? st.level : own.level, notes: own.notes ?? st.notes })
      .where(eq(schema.student.id, own.id)),
    db.delete(schema.student).where(eq(schema.student.id, st.id)),
    audit,
  ] as Batch);
  return { ok: true as const, studentId: own.id, studentName: own.name, organizationName: org?.name ?? '', merged: true };
}
