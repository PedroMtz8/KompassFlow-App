import { and, asc, eq, gt, gte, lt, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { customRoles, isSubset, memberAccess, permissionsOf, teachingUserIds } from '../auth/access';
import { sendInvitation } from '../emails/send';
import { db, schema } from './index';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Roles del sistema que se pueden asignar (el propietario solo se transfiere, no se invita). Además hay roles personalizados. */
export const assignableRoles = ['admin', 'instructor', 'staff'] as const;
export type AssignableRole = string;

export type RoleFail = 'INVALID_ROLE' | 'ONLY_OWNER_CAN_GRANT_ADMIN' | 'ROLE_EXCEEDS_YOURS';

/**
 * ¿Puede esta persona asignar este rol? Debe existir (del sistema o personalizado de la organización), solo el propietario
 * da «administrador» y nadie puede asignar un rol con más permisos de los que tiene (así no se escala a sí mismo ni a otros).
 */
export async function checkAssignableRole(organizationId: string, actorRole: string, role: string, actorId: string): Promise<RoleFail | null> {
  if (role === 'owner') return 'INVALID_ROLE';
  if (role === 'admin') return actorRole === 'owner' ? null : 'ONLY_OWNER_CAN_GRANT_ADMIN';
  const known = (assignableRoles as readonly string[]).includes(role) || (await customRoles(organizationId)).has(role);
  if (!known) return 'INVALID_ROLE';
  if (actorRole !== 'owner' && !isSubset(await permissionsOf(organizationId, role), (await memberAccess(organizationId, actorId))?.permissions ?? {}))
    return 'ROLE_EXCEEDS_YOURS';
  return null;
}

const INVITATION_DAYS = 7;

/** Qué puede ver quien consulta el equipo (los correos son datos personales: solo con permiso). */
export type TeamViewer = { canContact: boolean; canInvites: boolean; canManage: boolean };

export async function getTeam(organizationId: string, viewer: TeamViewer) {
  const [members, invitations, extras] = await Promise.all([
    db
      .select({
        id: schema.member.id,
        userId: schema.member.userId,
        role: schema.member.role,
        joinedAt: schema.member.createdAt,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
        // Cuenta creada por esta academia que aún no cambia su contraseña temporal.
        pendingActivation: sql<number>`(${schema.user.mustChangePassword} = 1 and ${schema.user.managedByOrgId} = ${organizationId})`,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, organizationId))
      .orderBy(asc(schema.member.createdAt)),
    // Las invitaciones pendientes muestran correos de personas ajenas aún: solo para quien invita.
    viewer.canInvites
      ? db
          .select({
            id: schema.invitation.id,
            email: schema.invitation.email,
            role: schema.invitation.role,
            expiresAt: schema.invitation.expiresAt,
          })
          .from(schema.invitation)
          .where(
            and(
              eq(schema.invitation.organizationId, organizationId),
              eq(schema.invitation.status, 'pending'),
              gt(schema.invitation.expiresAt, new Date())
            )
          )
          .orderBy(asc(schema.invitation.createdAt))
      : Promise.resolve([]),
    viewer.canManage
      ? db.select().from(schema.memberExtraPermission).where(eq(schema.memberExtraPermission.organizationId, organizationId))
      : Promise.resolve([]),
  ]);
  const extraOf = new Map(extras.map((e) => [e.memberId, JSON.parse(e.permission) as Record<string, string[]>]));
  return {
    members: members.map((m) => ({
      ...m,
      email: viewer.canContact ? m.email : null,
      pendingActivation: !!m.pendingActivation,
      // Lo adicional que tiene sobre su rol (solo lo ve quien administra al equipo).
      extraPermissions: extraOf.get(m.id) ?? null,
    })),
    invitations,
    viewer,
  };
}

/** Invita por correo. Idempotente: si ya hay una invitación pendiente, actualiza rol y vigencia. */
export async function inviteMember(actorId: string, actorRole: string, organizationId: string, emailRaw: string, role: AssignableRole) {
  const bad = await checkAssignableRole(organizationId, actorRole, role, actorId);
  if (bad) return { error: bad };
  const email = emailRaw.trim().toLowerCase();

  const existingUser = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (existingUser) {
    const already = await db.query.member.findFirst({
      where: and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, existingUser.id)),
    });
    if (already) return { error: 'ALREADY_MEMBER' as const };
  }

  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 3600 * 1000);
  const pending = await db.query.invitation.findFirst({
    where: and(
      eq(schema.invitation.organizationId, organizationId),
      eq(schema.invitation.email, email),
      eq(schema.invitation.status, 'pending')
    ),
  });
  if (pending) {
    await db.batch([
      db.update(schema.invitation).set({ role, expiresAt, inviterId: actorId }).where(eq(schema.invitation.id, pending.id)),
      auditStatement({
        organizationId,
        actorUserId: actorId,
        action: 'invitation.renewed',
        entityType: 'invitation',
        entityId: pending.id,
        metadata: { email, role },
      }),
    ] as Batch);
    await notifyInvitation(actorId, organizationId, email, role);
    return { id: pending.id };
  }

  const id = crypto.randomUUID();
  await db.batch([
    db.insert(schema.invitation).values({ id, organizationId, email, role, status: 'pending', expiresAt, inviterId: actorId }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: id,
      metadata: { email, role },
    }),
  ] as Batch);
  await notifyInvitation(actorId, organizationId, email, role);
  return { id };
}

/** Avisa por correo a quien fue invitado (mejor esfuerzo: si el correo falla, la invitación queda igual). */
async function notifyInvitation(actorId: string, organizationId: string, email: string, role: string) {
  const [org, inviter] = await Promise.all([
    db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) }),
    db.query.user.findFirst({ where: eq(schema.user.id, actorId) }),
  ]);
  const label = ({ admin: 'administrador', instructor: 'instructor', staff: 'staff' } as Record<string, string>)[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
  await sendInvitation(email, { inviter: inviter?.name ?? 'Alguien', organization: org?.name ?? 'una academia', role: label });
}

export async function cancelInvitation(actorId: string, organizationId: string, invitationId: string) {
  const inv = await db.query.invitation.findFirst({
    where: and(
      eq(schema.invitation.id, invitationId),
      eq(schema.invitation.organizationId, organizationId),
      eq(schema.invitation.status, 'pending')
    ),
  });
  if (!inv) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db.update(schema.invitation).set({ status: 'canceled' }).where(eq(schema.invitation.id, invitationId)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'invitation.canceled',
      entityType: 'invitation',
      entityId: invitationId,
      metadata: { email: inv.email },
    }),
  ] as Batch);
  return { ok: true as const };
}

export async function changeMemberRole(actorId: string, actorRole: string, organizationId: string, memberId: string, role: AssignableRole) {
  const m = await db.query.member.findFirst({
    where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)),
  });
  if (!m) return { error: 'NOT_FOUND' as const };
  if (m.role === 'owner') return { error: 'CANNOT_CHANGE_OWNER' as const };
  if (m.userId === actorId) return { error: 'CANNOT_CHANGE_SELF' as const };
  if (m.role === 'admin' && actorRole !== 'owner') return { error: 'ONLY_OWNER_CAN_GRANT_ADMIN' as const };
  const bad = await checkAssignableRole(organizationId, actorRole, role, actorId);
  if (bad) return { error: bad };
  await db.batch([
    // Al cambiar el rol se quitan los permisos adicionales de la persona: eran un complemento del rol anterior.
    db.delete(schema.memberExtraPermission).where(eq(schema.memberExtraPermission.memberId, memberId)),
    db.update(schema.member).set({ role }).where(eq(schema.member.id, memberId)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'member.role_changed',
      entityType: 'member',
      entityId: memberId,
      metadata: { from: m.role, to: role },
    }),
  ] as Batch);
  return { ok: true as const };
}

/** Clases próximas (sin cancelar) que esta persona imparte en la organización. */
const upcomingTaught = (organizationId: string, userId: string) =>
  db
    .select({ id: schema.classSession.id, startsAt: schema.classSession.startsAt, endsAt: schema.classSession.endsAt })
    .from(schema.classSession)
    .where(
      and(
        eq(schema.classSession.organizationId, organizationId),
        eq(schema.classSession.instructorUserId, userId),
        eq(schema.classSession.status, 'SCHEDULED'),
        gte(schema.classSession.startsAt, new Date())
      )
    );

/**
 * Antes de quitar a alguien del equipo: cuántas clases próximas imparte y quién más puede tomarlas
 * (personas del equipo que imparten clases, sin la que se va).
 */
export async function removalPreview(organizationId: string, memberId: string) {
  const m = await db.query.member.findFirst({ where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)) });
  if (!m) return null;
  const upcoming = await upcomingTaught(organizationId, m.userId);
  if (!upcoming.length) return { upcoming: 0, candidates: [] };
  const ids = (await teachingUserIds(organizationId)).filter((id) => id !== m.userId);
  const people = ids.length
    ? await db.select({ userId: schema.user.id, name: schema.user.name }).from(schema.user).where(sql`${schema.user.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  return { upcoming: upcoming.length, candidates: people.sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * Quita a alguien del equipo. Sus clases PRÓXIMAS pasan a `reassignTo` (si se indica y es del equipo y da clases) o quedan
 * sin instructor; las que se empalmarían con otra clase de quien las recibe quedan sin instructor y se cuentan aparte.
 * Las clases pasadas no se tocan (el historial conserva quién las dio).
 */
export async function removeMember(actorId: string, actorRole: string, organizationId: string, memberId: string, reassignTo?: string | null) {
  const m = await db.query.member.findFirst({
    where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)),
  });
  if (!m) return { error: 'NOT_FOUND' as const };
  if (m.role === 'owner') return { error: 'CANNOT_REMOVE_OWNER' as const };
  if (m.role === 'admin' && m.userId !== actorId && actorRole !== 'owner') return { error: 'ONLY_OWNER_CAN_GRANT_ADMIN' as const };

  let target: string | null = null;
  if (reassignTo) {
    const ok = reassignTo !== m.userId && (await teachingUserIds(organizationId)).includes(reassignTo);
    if (!ok) return { error: 'INVALID_REASSIGN' as const };
    target = reassignTo;
  }

  const sessions = await upcomingTaught(organizationId, m.userId);
  let moved = 0;
  const free: string[] = [];
  const give: string[] = [];
  for (const s of sessions) {
    if (!target) {
      free.push(s.id);
      continue;
    }
    const clash = await db
      .select({ id: schema.classSession.id })
      .from(schema.classSession)
      .where(
        and(
          eq(schema.classSession.organizationId, organizationId),
          eq(schema.classSession.instructorUserId, target),
          eq(schema.classSession.status, 'SCHEDULED'),
          lt(schema.classSession.startsAt, s.endsAt),
          gt(schema.classSession.endsAt, s.startsAt),
          ne(schema.classSession.id, s.id)
        )
      )
      .limit(1);
    (clash.length ? free : give).push(s.id);
  }
  moved = give.length;
  const setSessions = (ids: string[], to: string | null) =>
    db
      .update(schema.classSession)
      .set({ instructorUserId: to })
      .where(and(eq(schema.classSession.organizationId, organizationId), sql`${schema.classSession.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));

  await db.batch([
    ...(give.length ? [setSessions(give, target)] : []),
    ...(free.length ? [setSessions(free, null)] : []),
    // Las plantillas (servicios y series) dejan de apuntar a quien se va, para que las próximas clases no nazcan a su nombre.
    db.update(schema.sessionSeries).set({ instructorUserId: target }).where(and(eq(schema.sessionSeries.organizationId, organizationId), eq(schema.sessionSeries.instructorUserId, m.userId))),
    db.update(schema.service).set({ instructorUserId: target }).where(and(eq(schema.service.organizationId, organizationId), eq(schema.service.instructorUserId, m.userId))),
    db.delete(schema.member).where(eq(schema.member.id, memberId)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: m.userId === actorId ? 'member.left' : 'member.removed',
      entityType: 'member',
      entityId: memberId,
      metadata: { userId: m.userId, role: m.role, reassignedTo: target, classesMoved: moved, classesUnassigned: free.length },
    }),
  ] as unknown as Batch);
  return { ok: true as const, moved, unassigned: free.length };
}

export type TransferFail = 'NOT_FOUND' | 'SELF' | 'NOT_VERIFIED' | 'ALREADY_OWNER';

/**
 * Traspasa la academia: la persona elegida pasa a ser propietaria y quien traspasa queda como administradora (así no
 * pierde acceso de golpe). Debe ser alguien del equipo con el correo confirmado: la propiedad da control de los cobros,
 * el plan y la eliminación de la academia. Todo en una sola operación.
 */
export async function transferOwnership(actorId: string, organizationId: string, targetMemberId: string) {
  const target = await db.query.member.findFirst({
    where: and(eq(schema.member.id, targetMemberId), eq(schema.member.organizationId, organizationId)),
  });
  if (!target) return { error: 'NOT_FOUND' as const };
  if (target.userId === actorId) return { error: 'SELF' as const };
  if (target.role === 'owner') return { error: 'ALREADY_OWNER' as const };
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, target.userId) });
  if (!u?.emailVerified) return { error: 'NOT_VERIFIED' as const };

  await db.batch([
    db.update(schema.member).set({ role: 'owner' }).where(eq(schema.member.id, target.id)),
    db
      .update(schema.member)
      .set({ role: 'admin' })
      .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, actorId), eq(schema.member.role, 'owner'))),
    // Los permisos adicionales quedan de más: el propietario tiene todo.
    db.delete(schema.memberExtraPermission).where(eq(schema.memberExtraPermission.memberId, target.id)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'organization.ownership_transferred',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { toUserId: target.userId, previousRole: target.role },
    }),
  ] as unknown as Batch);
  return { ok: true as const };
}

/** Invitaciones pendientes dirigidas a este usuario (por correo). */
export async function listMyInvitations(email: string) {
  return db
    .select({
      id: schema.invitation.id,
      role: schema.invitation.role,
      expiresAt: schema.invitation.expiresAt,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .innerJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(
      and(
        eq(schema.invitation.email, email.toLowerCase()),
        eq(schema.invitation.status, 'pending'),
        gt(schema.invitation.expiresAt, new Date())
      )
    );
}

/**
 * Acepta una invitación. Exige correo VERIFICADO: sin verificación, cualquiera podría registrarse con el
 * correo de otra persona y entrar a su organización (PRD regla 7: vinculación con validación suficiente).
 */
export async function respondInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  invitationId: string,
  accept: boolean
) {
  const inv = await db.query.invitation.findFirst({
    where: and(
      eq(schema.invitation.id, invitationId),
      eq(schema.invitation.status, 'pending'),
      gt(schema.invitation.expiresAt, new Date())
    ),
  });
  if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase()) return { error: 'NOT_FOUND' as const };
  if (accept && !user.emailVerified) return { error: 'EMAIL_NOT_VERIFIED' as const };

  if (!accept) {
    await db.batch([
      db.update(schema.invitation).set({ status: 'rejected' }).where(eq(schema.invitation.id, inv.id)),
      auditStatement({
        organizationId: inv.organizationId,
        actorUserId: user.id,
        action: 'invitation.rejected',
        entityType: 'invitation',
        entityId: inv.id,
      }),
    ] as Batch);
    return { ok: true as const };
  }

  await db.batch([
    db
      .insert(schema.member)
      .values({
        id: crypto.randomUUID(),
        organizationId: inv.organizationId,
        userId: user.id,
        role: inv.role ?? 'staff',
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
    db.update(schema.invitation).set({ status: 'accepted' }).where(eq(schema.invitation.id, inv.id)),
    auditStatement({
      organizationId: inv.organizationId,
      actorUserId: user.id,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: inv.id,
      metadata: { role: inv.role },
    }),
  ] as Batch);
  return { ok: true as const, organizationId: inv.organizationId };
}

export async function getOwnMemberId(userId: string, organizationId: string) {
  const m = await db.query.member.findFirst({
    where: and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
  });
  return m?.id ?? null;
}
