import { and, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { auth, withoutVerificationEmail } from '../auth';
import { db, schema } from './index';
import { ensureStudentForUser } from './bookings';
import { auditStatement } from './organizations';
import { checkAssignableRole } from './team';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Vigencia de la contraseña temporal. Pasado el plazo hay que pedirle otra a la academia. */
export const TEMP_PASSWORD_DAYS = 7;
export type StaffRole = string;
export type AccountKind = { kind: 'student' } | { kind: 'staff'; role: StaffRole };

// Sin caracteres que se confunden al dictarlos (0/O, 1/I/l).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña temporal legible: tres bloques de 4 («Kd7m-Qx3p-Tn8w»), ~70 bits de entropía. */
export function tempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export type AccountFail =
  | 'EMAIL_EXISTS'
  | 'ONLY_OWNER_CAN_GRANT_ADMIN'
  | 'NOT_FOUND'
  | 'ALREADY_ACTIVATED'
  | 'ALREADY_MEMBER'
  | 'INVALID_ROLE'
  | 'ROLE_EXCEEDS_YOURS';

/**
 * Crea una cuenta con correo y contraseña temporal para alguien de la academia y la vincula de una vez (alumno o personal).
 * La contraseña se devuelve UNA vez: la persona debe cambiarla al entrar (`mustChangePassword`), con lo que quien creó la
 * cuenta deja de poder usarla. Si el correo ya tiene cuenta, no se toca: se usa la invitación normal.
 */
export async function createManagedAccount(
  actor: { userId: string; role: string },
  organizationId: string,
  input: { name: string; email: string } & AccountKind
) {
  if (input.kind === 'staff') {
    const bad = await checkAssignableRole(organizationId, actor.role, input.role, actor.userId);
    if (bad) return { error: bad };
  }
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (await db.query.user.findFirst({ where: eq(schema.user.email, email) })) return { error: 'EMAIL_EXISTS' as const };

  const password = tempPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 24 * 3600_000);
  let userId: string;
  try {
    userId = (await withoutVerificationEmail(email, () => auth.api.signUpEmail({ body: { email, password, name } }))).user.id;
  } catch {
    return { error: 'EMAIL_EXISTS' as const };
  }
  // `signUpEmail` abre sesión para la cuenta nueva; no debe quedar ninguna: la persona entra con las credenciales.
  await db.batch([
    db
      .update(schema.user)
      .set({ mustChangePassword: true, tempPasswordExpiresAt: expiresAt, managedByOrgId: organizationId })
      .where(eq(schema.user.id, userId)),
    db.delete(schema.session).where(eq(schema.session.userId, userId)),
  ] as Batch);

  if (input.kind === 'staff') {
    await db.batch([
      db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId, userId, role: input.role, createdAt: new Date() }),
      auditStatement({
        organizationId,
        actorUserId: actor.userId,
        action: 'account.created',
        entityType: 'user',
        entityId: userId,
        metadata: { kind: 'staff', role: input.role },
      }),
    ] as Batch);
  } else {
    // Si la academia ya tenía a esta persona como alumna sin cuenta (mismo correo), se une a ese registro.
    const existing = await db.query.student.findFirst({
      where: and(eq(schema.student.organizationId, organizationId), eq(schema.student.email, email)),
    });
    if (existing && !existing.userId) {
      await db.update(schema.student).set({ userId }).where(eq(schema.student.id, existing.id));
    } else {
      await ensureStudentForUser(organizationId, { id: userId, name, email });
    }
    await auditStatement({
      organizationId,
      actorUserId: actor.userId,
      action: 'account.created',
      entityType: 'user',
      entityId: userId,
      metadata: { kind: 'student' },
    });
  }
  return { userId, email, password, expiresAt };
}

/** ¿Esta persona pertenece a la academia (como personal o alumna)? */
async function belongsTo(organizationId: string, userId: string) {
  const m = await db.query.member.findFirst({ where: and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)) });
  if (m) return true;
  const s = await db.query.student.findFirst({ where: and(eq(schema.student.organizationId, organizationId), eq(schema.student.userId, userId)) });
  return !!s;
}

/**
 * Genera otra contraseña temporal. Solo mientras la persona NO haya activado su cuenta (no la haya cambiado) y solo
 * la academia que la creó: una vez que la persona pone su propia contraseña, nadie más puede tocarla.
 */
export async function resetManagedAccount(actorId: string, organizationId: string, userId: string) {
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!u || u.managedByOrgId !== organizationId || !(await belongsTo(organizationId, userId))) return { error: 'NOT_FOUND' as const };
  if (!u.mustChangePassword) return { error: 'ALREADY_ACTIVATED' as const };

  const password = tempPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 24 * 3600_000);
  const hash = await (await auth.$context).password.hash(password);
  await db.batch([
    db.update(schema.account).set({ password: hash }).where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential'))),
    db.update(schema.user).set({ tempPasswordExpiresAt: expiresAt }).where(eq(schema.user.id, userId)),
    db.delete(schema.session).where(eq(schema.session.userId, userId)),
    auditStatement({ organizationId, actorUserId: actorId, action: 'account.credentials_reset', entityType: 'user', entityId: userId }),
  ] as Batch);
  return { userId, email: u.email, password, expiresAt };
}

/** Personas de la academia con cuenta creada por ella que aún no la activan (para mostrar «por activar» y regenerar). */
export async function pendingActivation(organizationId: string) {
  const rows = await db
    .select({ id: schema.user.id, expiresAt: schema.user.tempPasswordExpiresAt })
    .from(schema.user)
    .where(and(eq(schema.user.managedByOrgId, organizationId), eq(schema.user.mustChangePassword, true)));
  return new Map(rows.map((r) => [r.id, r.expiresAt]));
}
