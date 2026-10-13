import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { cancelOrgSubscriptions } from '../billing/stripe-api';
import { env } from '../env';
import { sendAccountDeleted } from '../emails/send';
import { deleteByUrl } from '../lib/storage';
import { bookedPeople, notifyCanceled } from './classes';
import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Academias donde esta persona es la ÚNICA propietaria: no puede borrar su cuenta sin cerrarlas o dejarlas a otra persona. */
export async function soleOwnerOrganizations(userId: string) {
  const mine = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.role, 'owner')));
  const blockers: { id: string; name: string }[] = [];
  for (const o of mine) {
    const others = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, o.id), eq(schema.member.role, 'owner'), ne(schema.member.userId, userId)))
      .limit(1);
    if (!others.length) blockers.push(o);
  }
  return blockers;
}

/**
 * Elimina la cuenta y los datos personales de la persona. Las academias conservan lo que necesitan para su contabilidad
 * (pagos, asistencia, reservas), pero anonimizado: el registro de alumno pierde nombre, correo, teléfono y notas y deja de
 * apuntar a la cuenta. Lo demás (sesiones, vínculos, membresías, cuentas de acceso) se borra en cascada con el usuario.
 */
export async function deleteAccount(userId: string) {
  const blockers = await soleOwnerOrganizations(userId);
  if (blockers.length) return { error: 'OWNS_ORGANIZATIONS' as const, organizations: blockers };
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!u) return { error: 'NOT_FOUND' as const };

  const students = await db.select({ id: schema.student.id }).from(schema.student).where(eq(schema.student.userId, userId));
  const statements: BatchItem<'sqlite'>[] = [];
  if (students.length) {
    statements.push(
      db
        .update(schema.student)
        .set({ name: 'Cuenta eliminada', email: null, phone: null, notes: null, userId: null })
        .where(
          inArray(
            schema.student.id,
            students.map((s) => s.id)
          )
        )
    );
  }
  statements.push(
    // Invitaciones dirigidas a su correo: ya no tienen a quién llegar.
    db.delete(schema.invitation).where(eq(schema.invitation.email, u.email.toLowerCase())),
    auditStatement({ organizationId: null, actorUserId: userId, action: 'user.deleted', entityType: 'user', entityId: userId, metadata: { students: students.length } }),
    db.delete(schema.user).where(eq(schema.user.id, userId))
  );
  await db.batch(statements as Batch);

  // Mejor esfuerzo: un fallo aquí no deshace el borrado.
  await Promise.allSettled([deleteByUrl(u.image), sendAccountDeleted(u.email, u.name)]);
  return { ok: true as const };
}

/**
 * Elimina una academia completa (solo su propietario). Todo lo suyo se borra en cascada; quien tenía reservas próximas recibe
 * un aviso por correo. La bitácora de auditoría se conserva.
 */
export async function deleteOrganization(actorId: string, organizationId: string, confirmName: string) {
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  if (!org) return { error: 'NOT_FOUND' as const };
  if (org.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) return { error: 'NAME_MISMATCH' as const };

  const detail = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  const upcoming = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(and(eq(schema.classSession.organizationId, organizationId), eq(schema.classSession.status, 'SCHEDULED')));
  const people = upcoming.length ? await bookedPeople(upcoming.map((s) => s.id)) : [];

  // Si la academia tiene suscripción, se cancela ANTES de borrar: si Stripe falla no se borra nada (no se puede seguir
  // cobrando a una academia que ya no existe).
  if (env.stripe) {
    const subs = await db
      .select({ id: schema.subscription.stripeSubscriptionId })
      .from(schema.subscription)
      .where(eq(schema.subscription.referenceId, organizationId));
    try {
      await cancelOrgSubscriptions(subs.map((x) => x.id).filter((x): x is string => !!x));
    } catch {
      return { error: 'BILLING_FAILED' as const };
    }
  }

  await db.batch([
    auditStatement({ organizationId: null, actorUserId: actorId, action: 'organization.deleted', entityType: 'organization', entityId: organizationId, metadata: { name: org.name } }),
    db.delete(schema.organization).where(eq(schema.organization.id, organizationId)),
  ] as Batch);

  // Las reservas ya no existen: se avisa con el nombre de la academia (los datos se leyeron antes de borrar).
  await Promise.allSettled([
    notifyCanceled(organizationId, people, org.name, detail?.timezone),
    deleteByUrl(org.logo),
    deleteByUrl(detail?.coverImage),
  ]);
  return { ok: true as const };
}
