import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { getPlans, invalidatePlans } from '../billing/plan-config';
import { PAID_PLANS, PLANS, isPlanKey, type PlanKey } from '../billing/plans';
import { stripeCall } from '../billing/stripe-api';
import { env } from '../env';
import { zonedTimeToUtc } from '../lib/time';
import { activeOverride } from './billing';
import { db, schema } from './index';
import { auditStatement } from './organizations';
import { verificationCounts } from './verification';

/** ¿Es administrador de la plataforma? Correo en `PLATFORM_ADMIN_EMAILS` y confirmado (si no, alguien podría registrarse con ese correo). */
export const isPlatformAdmin = (u: { email: string; emailVerified?: boolean | null }) =>
  !!u.emailVerified && env.platformAdminEmails.includes(u.email.toLowerCase());

const num = (n: number) => (n === Infinity ? null : n);

/** Los planes con sus valores vigentes (para la pantalla del administrador). Los límites en `null` = sin límite. */
export async function listPlansForAdmin() {
  const [plans, rows] = await Promise.all([getPlans(), db.select().from(schema.planSetting)]);
  const by = new Map(rows.map((r) => [r.plan, r]));
  return (Object.keys(PLANS) as PlanKey[]).map((key) => {
    const p = plans[key];
    const r = by.get(key);
    return {
      key,
      name: p.name,
      priceMxn: p.priceMxn,
      trialDays: p.trialDays,
      limits: {
        students: num(p.limits.students),
        members: num(p.limits.members),
        locations: num(p.limits.locations),
        reports: p.limits.reports,
      },
      cardFeeBps: p.cardFeeBps,
      /** Gratis no se cobra: su precio y su prueba no se editan. */
      priceEditable: key !== 'free',
      hasStripePrice: !!p.priceId,
      updatedAt: r?.updatedAt ?? null,
    };
  });
}

export type PlanUpdate = {
  priceMxn?: number;
  trialDays?: number;
  /** `null` = sin límite. */
  maxStudents?: number | null;
  maxMembers?: number | null;
  maxLocations?: number | null;
  reports?: boolean;
  cardFeeBps?: number;
};

/**
 * Guarda los ajustes de un plan. Si cambia el precio de un plan de pago se crea un precio nuevo en Stripe (los precios no se
 * editan) y el anterior se retira: quienes ya están suscritos conservan lo que pagan, los nuevos pagan el precio nuevo.
 */
export async function updatePlan(actorId: string, plan: string, input: PlanUpdate) {
  if (!isPlanKey(plan)) return { error: 'NOT_FOUND' as const };
  const current = (await getPlans())[plan];
  const paid = PAID_PLANS.includes(plan);
  if (!paid && (input.priceMxn !== undefined || input.trialDays !== undefined)) return { error: 'FREE_PLAN' as const };

  const values: Partial<typeof schema.planSetting.$inferInsert> = {};
  if (input.priceMxn !== undefined) values.priceMxn = input.priceMxn;
  if (input.trialDays !== undefined) values.trialDays = input.trialDays;
  if (input.maxStudents !== undefined) values.maxStudents = input.maxStudents ?? -1;
  if (input.maxMembers !== undefined) values.maxMembers = input.maxMembers ?? -1;
  if (input.maxLocations !== undefined) values.maxLocations = input.maxLocations ?? -1;
  if (input.reports !== undefined) values.reports = input.reports;
  if (input.cardFeeBps !== undefined) values.cardFeeBps = input.cardFeeBps;

  if (paid && input.priceMxn !== undefined && input.priceMxn !== current.priceMxn && env.stripe) {
    if (!current.priceId) return { error: 'NO_STRIPE_PRICE' as const };
    try {
      const old = (await stripeCall('GET', `/prices/${current.priceId}`)) as { product: string };
      const created = (await stripeCall(
        'POST',
        '/prices',
        {
          currency: 'mxn',
          unit_amount: String(input.priceMxn * 100),
          'recurring[interval]': 'month',
          product: String(old.product),
          lookup_key: `stagelight_${plan}_monthly`,
          transfer_lookup_key: 'true',
        },
        { idempotencyKey: `plan-price-${plan}-${input.priceMxn}-${current.priceId}` },
      )) as { id: string };
      // El precio anterior deja de ofrecerse, pero sus suscripciones siguen vivas y se reconocen como de este plan.
      await stripeCall('POST', `/prices/${current.priceId}`, { active: 'false' }).catch(() => null);
      values.stripePriceId = created.id;
      values.retiredPriceIds = JSON.stringify([...new Set([...current.retiredPriceIds, current.priceId])]);
    } catch {
      return { error: 'STRIPE_FAILED' as const };
    }
  }

  if (!Object.keys(values).length) return { ok: true as const };
  await db.batch([
    db
      .insert(schema.planSetting)
      .values({ plan, ...values, updatedBy: actorId })
      .onConflictDoUpdate({ target: schema.planSetting.plan, set: { ...values, updatedBy: actorId, updatedAt: new Date() } }),
    auditStatement({
      organizationId: null,
      actorUserId: actorId,
      action: 'plan.updated',
      entityType: 'plan',
      entityId: plan,
      metadata: input,
    }),
  ]);
  invalidatePlans();
  return { ok: true as const };
}

/** Quita lo guardado de un plan: vuelve a los valores por defecto (código y variables de entorno). */
export async function resetPlan(actorId: string, plan: string) {
  if (!isPlanKey(plan)) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db
      .update(schema.planSetting)
      .set({
        priceMxn: null,
        trialDays: null,
        maxStudents: null,
        maxMembers: null,
        maxLocations: null,
        reports: null,
        cardFeeBps: null,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(schema.planSetting.plan, plan)),
    auditStatement({ organizationId: null, actorUserId: actorId, action: 'plan.reset', entityType: 'plan', entityId: plan }),
  ]);
  invalidatePlans();
  return { ok: true as const };
}

/* ── Resumen de la plataforma ─────────────────────────────────────────────── */

const TZ = 'America/Mexico_City';
const monthStart = (offset = 0) => {
  const d = new Date(Date.now() + offset * 31 * 864e5);
  const ym = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: TZ }).format(d).slice(0, 7);
  return { ym, start: zonedTimeToUtc(`${ym}-01`, '00:00', TZ) };
};

/** Cifras de la plataforma: academias, suscripciones (ingreso mensual), cobros con tarjeta, comisión ganada y crédito contra débito. */
export async function platformOverview() {
  const plans = await getPlans();
  const now = Date.now();
  const thisMonth = monthStart().start;
  const since30 = new Date(now - 30 * 864e5);

  const [[orgs], [orgsNew], [users], [students], subs, cardRows] = await Promise.all([
    db.select({ n: count() }).from(schema.organization),
    db.select({ n: count() }).from(schema.organization).where(gte(schema.organization.createdAt, since30)),
    db.select({ n: count() }).from(schema.user),
    db.select({ n: count() }).from(schema.student),
    db
      .select({ plan: schema.subscription.plan, status: schema.subscription.status, ref: schema.subscription.referenceId })
      .from(schema.subscription)
      .where(inArray(schema.subscription.status, ['active', 'trialing', 'past_due'])),
    db
      .select({
        amount: schema.payment.amountCents,
        fee: schema.payment.feeCents,
        status: schema.payment.status,
        funding: schema.payment.cardFunding,
        brand: schema.payment.cardBrand,
        paidAt: schema.payment.paidAt,
      })
      .from(schema.payment)
      .where(and(eq(schema.payment.method, 'CARD'), inArray(schema.payment.status, ['PAID', 'REFUNDED'])))
      .limit(20_000),
  ]);

  // Una academia cuenta una vez, con su suscripción vigente más cara.
  const order = ['free', 'starter', 'pro', 'business'];
  const byOrg = new Map<string, { plan: PlanKey; status: string }>();
  for (const x of subs) {
    if (!isPlanKey(x.plan)) continue;
    const cur = byOrg.get(x.ref);
    if (!cur || order.indexOf(x.plan) > order.indexOf(cur.plan)) byOrg.set(x.ref, { plan: x.plan, status: x.status });
  }
  const planCounts = Object.fromEntries((Object.keys(PLANS) as PlanKey[]).map((k) => [k, { active: 0, trialing: 0 }])) as Record<
    PlanKey,
    { active: number; trialing: number }
  >;
  let mrr = 0;
  let mrrTrial = 0;
  for (const { plan, status } of byOrg.values()) {
    if (status === 'trialing') {
      planCounts[plan].trialing++;
      mrrTrial += plans[plan].priceMxn;
    } else {
      planCounts[plan].active++;
      mrr += plans[plan].priceMxn;
    }
  }
  planCounts.free.active = Math.max(0, orgs.n - byOrg.size);

  const paid = cardRows.filter((c) => c.status === 'PAID');
  const sum = (rows: typeof cardRows, k: 'amount' | 'fee') => rows.reduce((a, r) => a + r[k], 0);
  const month = paid.filter((c) => c.paidAt && c.paidAt.getTime() >= thisMonth);
  const funding: Record<string, { count: number; amountCents: number }> = {};
  for (const c of paid) {
    const k = c.funding ?? 'unknown';
    funding[k] ??= { count: 0, amountCents: 0 };
    funding[k].count++;
    funding[k].amountCents += c.amount;
  }
  // Comisión ganada por mes (últimos 6, el actual incluido).
  const months = Array.from({ length: 6 }, (_, i) => monthStart(i - 5));
  const feeByMonth = months.map((m, i) => {
    const end = months[i + 1]?.start ?? Infinity;
    const rows = paid.filter((c) => c.paidAt && c.paidAt.getTime() >= m.start && c.paidAt.getTime() < end);
    return { month: m.ym, feeCents: sum(rows, 'fee'), volumeCents: sum(rows, 'amount'), count: rows.length };
  });

  return {
    currency: 'MXN',
    orgs: { total: orgs.n, last30: orgsNew.n },
    users: users.n,
    students: students.n,
    verifications: await verificationCounts(),
    subscriptions: { plans: planCounts, mrrMxn: mrr, trialMrrMxn: mrrTrial },
    card: {
      month: { count: month.length, volumeCents: sum(month, 'amount'), feeCents: sum(month, 'fee') },
      all: { count: paid.length, volumeCents: sum(paid, 'amount'), feeCents: sum(paid, 'fee'), refunded: cardRows.length - paid.length },
      funding,
      feeByMonth,
    },
  };
}

/* ── Academias ────────────────────────────────────────────────────────────── */

const like = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Academias de la plataforma con su plan, alumnos y lo que han cobrado con tarjeta (por páginas; busca por nombre o correo del propietario). */
export async function listOrgsForAdmin(opts: { q?: string; id?: string; limit?: number; offset?: number } = {}) {
  const term = opts.q?.trim();
  const rows = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      logo: schema.organization.logo,
      createdAt: schema.organization.createdAt,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
    })
    .from(schema.organization)
    .leftJoin(schema.member, and(eq(schema.member.organizationId, schema.organization.id), eq(schema.member.role, 'owner')))
    .leftJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      opts.id
        ? eq(schema.organization.id, opts.id)
        : term
          ? sql`(lower(${schema.organization.name}) like ${like(term)} escape '\\' or lower(coalesce(${schema.user.email}, '')) like ${like(term)} escape '\\' or lower(coalesce(${schema.user.name}, '')) like ${like(term)} escape '\\')`
          : undefined,
    )
    .orderBy(desc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [subs, studentCounts, cards, overrides] = await Promise.all([
    db
      .select({ ref: schema.subscription.referenceId, plan: schema.subscription.plan, status: schema.subscription.status })
      .from(schema.subscription)
      .where(and(inArray(schema.subscription.referenceId, ids), inArray(schema.subscription.status, ['active', 'trialing', 'past_due']))),
    db
      .select({ org: schema.student.organizationId, n: count() })
      .from(schema.student)
      .where(inArray(schema.student.organizationId, ids))
      .groupBy(schema.student.organizationId),
    db
      .select({
        org: schema.payment.organizationId,
        n: count(),
        volume: sql<number>`coalesce(sum(${schema.payment.amountCents}), 0)`,
        fee: sql<number>`coalesce(sum(${schema.payment.feeCents}), 0)`,
      })
      .from(schema.payment)
      .where(and(inArray(schema.payment.organizationId, ids), eq(schema.payment.method, 'CARD'), eq(schema.payment.status, 'PAID')))
      .groupBy(schema.payment.organizationId),
    db.select().from(schema.planOverride).where(inArray(schema.planOverride.organizationId, ids)),
  ]);
  const now = Date.now();
  const granted = new Map(overrides.filter((o) => !o.expiresAt || o.expiresAt.getTime() > now).map((o) => [o.organizationId, o]));
  const order = ['free', 'starter', 'pro', 'business'];
  const planOf = new Map<string, { plan: string; status: string }>();
  for (const x of subs) {
    const cur = planOf.get(x.ref);
    if (!cur || order.indexOf(x.plan) > order.indexOf(cur.plan)) planOf.set(x.ref, { plan: x.plan, status: x.status });
  }
  const st = new Map(studentCounts.map((x) => [x.org, x.n]));
  const cd = new Map(cards.map((x) => [x.org, x]));
  return rows.map((r) => ({
    ...r,
    // El plan otorgado a mano manda sobre la suscripción mientras esté vigente.
    plan: granted.get(r.id)?.plan ?? planOf.get(r.id)?.plan ?? 'free',
    planStatus: granted.has(r.id) ? 'granted' : (planOf.get(r.id)?.status ?? null),
    students: st.get(r.id) ?? 0,
    cardPayments: Number(cd.get(r.id)?.n ?? 0),
    cardVolumeCents: Number(cd.get(r.id)?.volume ?? 0),
    cardFeeCents: Number(cd.get(r.id)?.fee ?? 0),
  }));
}

/** Detalle de una academia para la administración. */
export async function orgDetailForAdmin(organizationId: string) {
  const [base] = await listOrgsForAdmin({ id: organizationId, limit: 1 });
  if (!base) return null;
  const [[members], [locations], [upcoming], connect, detail, lastPay] = await Promise.all([
    db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, organizationId)),
    db.select({ n: count() }).from(schema.location).where(eq(schema.location.organizationId, organizationId)),
    db
      .select({ n: count() })
      .from(schema.classSession)
      .where(
        and(
          eq(schema.classSession.organizationId, organizationId),
          eq(schema.classSession.status, 'SCHEDULED'),
          gte(schema.classSession.startsAt, new Date()),
        ),
      ),
    db.query.paymentSettings.findFirst({ where: eq(schema.paymentSettings.organizationId, organizationId) }),
    db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) }),
    db
      .select({ at: schema.payment.createdAt })
      .from(schema.payment)
      .where(eq(schema.payment.organizationId, organizationId))
      .orderBy(desc(schema.payment.createdAt))
      .limit(1),
  ]);
  const grant = await activeOverride(organizationId);
  const sub = await db
    .select()
    .from(schema.subscription)
    .where(
      and(eq(schema.subscription.referenceId, organizationId), inArray(schema.subscription.status, ['active', 'trialing', 'past_due'])),
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);
  return {
    ...base,
    members: members.n,
    locations: locations.n,
    upcomingSessions: upcoming.n,
    published: !!detail?.isPublished,
    verificationStatus: detail?.verificationStatus ?? 'NONE',
    planGrant: grant ? { plan: grant.plan, expiresAt: grant.expiresAt, note: grant.note, createdAt: grant.createdAt } : null,
    cardEnabled: !!connect?.stripeChargesEnabled,
    lastPaymentAt: lastPay[0]?.at ?? null,
    subscription: sub[0] ? { plan: sub[0].plan, status: sub[0].status, trialEnd: sub[0].trialEnd, periodEnd: sub[0].periodEnd } : null,
  };
}

/* ── Plan otorgado a mano ─────────────────────────────────────────────────── */

/**
 * Otorga un plan a una academia (cortesía, prueba extendida, acuerdo comercial). `days = null` = sin vencimiento. No toca la
 * suscripción de Stripe: al vencer o al quitarlo la academia vuelve al plan que realmente paga.
 */
export async function grantPlan(
  actorId: string,
  organizationId: string,
  input: { plan: string; days: number | null; note?: string | null },
) {
  if (!isPlanKey(input.plan)) return { error: 'PLAN_NOT_FOUND' as const };
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  if (!org) return { error: 'NOT_FOUND' as const };
  const expiresAt = input.days === null ? null : new Date(Date.now() + input.days * 86_400_000);
  const note = input.note?.trim() ? input.note.trim().slice(0, 300) : null;
  await db.batch([
    db
      .insert(schema.planOverride)
      .values({ organizationId, plan: input.plan, expiresAt, note, grantedBy: actorId })
      .onConflictDoUpdate({
        target: schema.planOverride.organizationId,
        set: { plan: input.plan, expiresAt, note, grantedBy: actorId, createdAt: new Date() },
      }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'plan.granted',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { plan: input.plan, days: input.days, note },
    }),
  ]);
  return { ok: true as const };
}

export async function revokePlan(actorId: string, organizationId: string) {
  const had = await db.query.planOverride.findFirst({ where: eq(schema.planOverride.organizationId, organizationId) });
  if (!had) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db.delete(schema.planOverride).where(eq(schema.planOverride.organizationId, organizationId)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'plan.grant_revoked',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { plan: had.plan },
    }),
  ]);
  return { ok: true as const };
}

/* ── Usuarios ─────────────────────────────────────────────────────────────── */

/** Cuentas de la plataforma (por páginas; busca por nombre o correo) con las organizaciones a las que pertenecen. */
export async function listUsersForAdmin(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const term = opts.q?.trim();
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      emailVerified: schema.user.emailVerified,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .where(
      term
        ? sql`(lower(${schema.user.name}) like ${like(term)} escape '\\' or lower(${schema.user.email}) like ${like(term)} escape '\\')`
        : undefined,
    )
    .orderBy(desc(schema.user.createdAt), asc(schema.user.id))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [memberships, links, suspended] = await Promise.all([
    db
      .select({ userId: schema.member.userId, role: schema.member.role, orgId: schema.organization.id, org: schema.organization.name })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .where(inArray(schema.member.userId, ids)),
    db
      .select({ userId: schema.student.userId, n: count() })
      .from(schema.student)
      .where(inArray(schema.student.userId, ids))
      .groupBy(schema.student.userId),
    db.select({ userId: schema.userSuspension.userId }).from(schema.userSuspension).where(inArray(schema.userSuspension.userId, ids)),
  ]);
  const banned = new Set(suspended.map((x) => x.userId));
  const by = new Map<string, { id: string; name: string; role: string }[]>();
  for (const m of memberships) by.set(m.userId, [...(by.get(m.userId) ?? []), { id: m.orgId, name: m.org, role: m.role }]);
  const st = new Map(links.map((l) => [l.userId, l.n]));
  return rows.map((r) => ({
    ...r,
    isPlatformAdmin: isPlatformAdmin(r),
    suspended: banned.has(r.id),
    organizations: by.get(r.id) ?? [],
    studentIn: st.get(r.id) ?? 0,
  }));
}

/** ¿La cuenta está suspendida? (se consulta en cada petición autenticada y al iniciar sesión). */
export async function isSuspended(userId: string) {
  const [row] = await db
    .select({ id: schema.userSuspension.userId })
    .from(schema.userSuspension)
    .where(eq(schema.userSuspension.userId, userId))
    .limit(1);
  return !!row;
}

/** Detalle de una cuenta para la administración. */
export async function userDetailForAdmin(userId: string) {
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!u) return null;
  const [memberships, students, sus, [bookings], [paid], recent, sessions] = await Promise.all([
    db
      .select({ id: schema.organization.id, name: schema.organization.name, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .where(eq(schema.member.userId, userId)),
    db
      .select({ orgId: schema.organization.id, org: schema.organization.name })
      .from(schema.student)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.student.organizationId))
      .where(eq(schema.student.userId, userId)),
    db.query.userSuspension.findFirst({ where: eq(schema.userSuspension.userId, userId) }),
    db
      .select({ n: count() })
      .from(schema.booking)
      .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
      .where(eq(schema.student.userId, userId)),
    db
      .select({ n: count(), total: sql<number>`coalesce(sum(${schema.payment.amountCents}), 0)` })
      .from(schema.payment)
      .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
      .where(and(eq(schema.student.userId, userId), eq(schema.payment.status, 'PAID'))),
    db
      .select({ action: schema.auditLog.action, at: schema.auditLog.createdAt, org: schema.auditLog.organizationId })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actorUserId, userId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(10),
    db
      .select({ n: count(), last: sql<number | null>`max(${schema.session.updatedAt})` })
      .from(schema.session)
      .where(eq(schema.session.userId, userId)),
  ]);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    isPlatformAdmin: isPlatformAdmin(u),
    suspension: sus ? { reason: sus.reason, at: sus.createdAt } : null,
    organizations: memberships,
    studentIn: students.map((s) => ({ id: s.orgId, name: s.org })),
    bookings: bookings.n,
    paidCents: Number(paid.total),
    paidCount: paid.n,
    openSessions: sessions[0]?.n ?? 0,
    lastActiveAt: sessions[0]?.last ? new Date(Number(sessions[0].last)) : null,
    recentActions: recent,
  };
}

/** Suspende una cuenta: cierra todas sus sesiones y le impide volver a entrar. No aplica a administradores ni a uno mismo. */
export async function suspendUser(actorId: string, userId: string, reason: string) {
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!u) return { error: 'NOT_FOUND' as const };
  if (userId === actorId || isPlatformAdmin(u)) return { error: 'PROTECTED' as const };
  await db.batch([
    db
      .insert(schema.userSuspension)
      .values({ userId, reason: reason.trim(), suspendedBy: actorId })
      .onConflictDoUpdate({
        target: schema.userSuspension.userId,
        set: { reason: reason.trim(), suspendedBy: actorId, createdAt: new Date() },
      }),
    db.delete(schema.session).where(eq(schema.session.userId, userId)),
    auditStatement({
      organizationId: null,
      actorUserId: actorId,
      action: 'user.suspended',
      entityType: 'user',
      entityId: userId,
      metadata: { reason: reason.trim() },
    }),
  ]);
  return { ok: true as const };
}

export async function reactivateUser(actorId: string, userId: string) {
  const had = await db.query.userSuspension.findFirst({ where: eq(schema.userSuspension.userId, userId) });
  if (!had) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db.delete(schema.userSuspension).where(eq(schema.userSuspension.userId, userId)),
    auditStatement({ organizationId: null, actorUserId: actorId, action: 'user.reactivated', entityType: 'user', entityId: userId }),
  ]);
  return { ok: true as const };
}

/* ── Bitácora ─────────────────────────────────────────────────────────────── */

/** Bitácora de todas las academias y de la administración: más reciente primero, por páginas; filtra por prefijo de acción ("plan.", "user."). */
const target = alias(schema.user, 'audit_target');

export async function listAudit(opts: { prefix?: string; limit?: number; offset?: number } = {}) {
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      entityType: schema.auditLog.entityType,
      entityId: schema.auditLog.entityId,
      metadata: schema.auditLog.metadata,
      at: schema.auditLog.createdAt,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
      orgId: schema.auditLog.organizationId,
      orgName: schema.organization.name,
      /** Cuenta afectada, cuando la acción es sobre un usuario (suspender, reactivar…). */
      targetName: sql<string | null>`case when ${schema.auditLog.entityType} = 'user' then ${target.name} end`,
      targetEmail: sql<string | null>`case when ${schema.auditLog.entityType} = 'user' then ${target.email} end`,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorUserId))
    .leftJoin(target, eq(target.id, schema.auditLog.entityId))
    .leftJoin(schema.organization, eq(schema.organization.id, schema.auditLog.organizationId))
    .where(
      opts.prefix ? sql`${schema.auditLog.action} like ${`${opts.prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} escape '\\'` : undefined,
    )
    .orderBy(desc(schema.auditLog.createdAt), asc(schema.auditLog.id))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
  return rows;
}
