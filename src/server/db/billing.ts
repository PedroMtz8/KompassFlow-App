import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { getPlans, planOfPrice } from '../billing/plan-config';
import { isPlanKey, type PlanKey, type PlanLimits } from '../billing/plans';
import { stripeCall } from '../billing/stripe-api';
import { env } from '../env';
import { db, schema } from './index';

/** Suscripción vigente de la organización (la administra Stripe vía el plugin), o `null` si no tiene. */
async function currentSubscription(organizationId: string) {
  const [row] = await db
    .select()
    .from(schema.subscription)
    .where(
      and(eq(schema.subscription.referenceId, organizationId), inArray(schema.subscription.status, ['active', 'trialing', 'past_due']))
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);
  return row ?? null;
}

/** Plan otorgado a mano por la administración, si sigue vigente. */
export async function activeOverride(organizationId: string) {
  const row = await db.query.planOverride.findFirst({ where: eq(schema.planOverride.organizationId, organizationId) });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return isPlanKey(row.plan) ? { ...row, plan: row.plan as PlanKey } : null;
}

/** Plan efectivo: el que otorgó la administración (si sigue vigente); si no, el de la suscripción; sin suscripción rige el plan Gratis. */
export async function getOrgPlan(organizationId: string) {
  // Sin Stripe configurado (desarrollo) la facturación está apagada y no se aplican límites.
  const plans = await getPlans();
  if (!env.stripe) return { key: 'business' as PlanKey, def: plans.business, subscription: null, override: null };
  const [sub, override] = await Promise.all([currentSubscription(organizationId), activeOverride(organizationId)]);
  const key: PlanKey = override ? override.plan : sub && isPlanKey(sub.plan) ? sub.plan : 'free';
  return { key, def: plans[key], subscription: sub, override };
}

export async function getUsage(organizationId: string) {
  const [students, members, locations] = await Promise.all([
    db.select({ n: count() }).from(schema.student).where(eq(schema.student.organizationId, organizationId)),
    db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, organizationId)),
    db.select({ n: count() }).from(schema.location).where(eq(schema.location.organizationId, organizationId)),
  ]);
  return { students: students[0].n, members: members[0].n, locations: locations[0].n };
}

export type LimitKey = Exclude<keyof PlanLimits, 'reports'>;

const LABEL: Record<LimitKey, string> = { students: 'alumnos', members: 'miembros del equipo', locations: 'ubicaciones' };

/** ¿Puede crear uno más? Devuelve un mensaje para el usuario cuando el plan ya no lo permite. */
export async function checkLimit(organizationId: string, key: LimitKey): Promise<{ ok: true } | { ok: false; message: string }> {
  const [{ def }, usage] = await Promise.all([getOrgPlan(organizationId), getUsage(organizationId)]);
  const max = def.limits[key];
  // Las invitaciones pendientes ocupan lugar: si no, se podría superar el límite invitando a muchos a la vez.
  let used = usage[key];
  if (key === 'members') {
    const [p] = await db
      .select({ n: count() })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, organizationId), eq(schema.invitation.status, 'pending')));
    used += p.n;
  }
  if (used < max) return { ok: true };
  return { ok: false, message: `Tu plan ${def.name} permite hasta ${max} ${LABEL[key]}. Cambia de plan para agregar más.` };
}

export async function hasFeature(organizationId: string, feature: 'reports') {
  const { def } = await getOrgPlan(organizationId);
  return def.limits[feature];
}

const LIVE = ['trialing', 'active', 'past_due'];
const lastSync = new Map<string, number>();

/** ¿Hay un pago de plan iniciado que todavía no se aplicó (Checkout abierto o aviso de Stripe sin llegar)? */
export async function hasPendingCheckout(organizationId: string) {
  const [row] = await db
    .select({ id: schema.subscription.id })
    .from(schema.subscription)
    .where(and(eq(schema.subscription.referenceId, organizationId), eq(schema.subscription.status, 'incomplete')))
    .limit(1);
  return !!row;
}

/**
 * Concilia con Stripe las suscripciones de la organización. El aviso (webhook) es la vía normal, pero puede tardar, perderse o no
 * estar escuchándose (desarrollo): si hay un pago de plan sin aplicar, se consulta a Stripe y se aplica. Es idempotente y solo
 * toca filas ya existentes de esa organización; se limita a una consulta cada pocos segundos.
 */
export async function reconcileSubscriptions(organizationId: string) {
  if (!env.stripe) return { changed: 0 };
  const now = Date.now();
  if (now - (lastSync.get(organizationId) ?? 0) < 5000) return { changed: 0 };
  lastSync.set(organizationId, now);

  const rows = await db.select().from(schema.subscription).where(eq(schema.subscription.referenceId, organizationId));
  const customers = [...new Set(rows.map((r) => r.stripeCustomerId).filter((c): c is string => !!c))];
  let changed = 0;
  for (const customer of customers) {
    const list = await stripeCall('GET', `/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`).catch(() => null);
    for (const s of (list?.data ?? []) as Record<string, any>[]) {
      const item = s.items?.data?.[0];
      const plan = await planOfPrice(item?.price?.id);
      if (!plan) continue;
      const values = {
        plan,
        status: s.status as string,
        stripeSubscriptionId: s.id as string,
        periodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
        periodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        trialStart: s.trial_start ? new Date(s.trial_start * 1000) : null,
        trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        seats: item?.quantity ?? 1,
        billingInterval: item?.price?.recurring?.interval ?? 'month',
      };
      const linked = rows.find((r) => r.stripeSubscriptionId === s.id);
      if (linked) {
        // Ya aplicada: solo se corrige si Stripe dice otra cosa (p. ej. se canceló o cambió de plan).
        if (linked.status !== values.status || linked.plan !== values.plan) {
          await db.update(schema.subscription).set(values).where(eq(schema.subscription.id, linked.id));
          changed++;
        }
        continue;
      }
      // Una suscripción viva de Stripe sin fila propia: es el pago pendiente. Se aplica a la fila «incomplete» del mismo plan (o a cualquiera).
      if (!LIVE.includes(s.status)) continue;
      const pending = rows.filter((r) => r.status === 'incomplete' && !r.stripeSubscriptionId);
      const target = pending.find((r) => r.plan === plan) ?? pending[0];
      if (!target) continue;
      await db.update(schema.subscription).set(values).where(eq(schema.subscription.id, target.id));
      target.stripeSubscriptionId = s.id;
      target.status = values.status;
      changed++;
    }
  }
  return { changed };
}

/** Resumen para la pantalla de plan: plan vigente, límites, uso y planes disponibles. */
export async function getBilling(organizationId: string) {
  // Si hay un pago sin aplicar, se concilia con Stripe antes de responder.
  if (env.stripe && (await hasPendingCheckout(organizationId))) await reconcileSubscriptions(organizationId).catch(() => null);
  const pendingCheckout = env.stripe ? await hasPendingCheckout(organizationId) : false;
  const [{ key, def, subscription, override }, usage, all] = await Promise.all([getOrgPlan(organizationId), getUsage(organizationId), getPlans()]);
  const num = (n: number) => (n === Infinity ? null : n);
  return {
    enabled: !!env.stripe,
    pendingCheckout,
    // Comisión (puntos base, 100 = 1%) que se retiene de los cobros con tarjeta a los alumnos con este plan.
    cardFeeBps: def.cardFeeBps,
    plan: key,
    planName: def.name,
    // Plan otorgado por Kompass (cortesía o prueba extendida): vence en `until` (null = sin fecha).
    granted: override ? { until: override.expiresAt } : null,
    status: subscription?.status ?? null,
    trialEnd: subscription?.trialEnd ?? null,
    periodEnd: subscription?.periodEnd ?? null,
    cancelAtPeriodEnd: !!subscription?.cancelAtPeriodEnd,
    usage,
    limits: {
      students: num(def.limits.students),
      members: num(def.limits.members),
      locations: num(def.limits.locations),
      reports: def.limits.reports,
    },
    plans: Object.values(all).map((p) => ({
      key: p.key,
      name: p.name,
      priceMxn: p.priceMxn,
      trialDays: p.trialDays,
      cardFeeBps: p.cardFeeBps,
      limits: {
        students: num(p.limits.students),
        members: num(p.limits.members),
        locations: num(p.limits.locations),
        reports: p.limits.reports,
      },
      // Solo se puede contratar un plan de pago si su precio ya está configurado en Stripe.
      available: p.key !== 'free' && !!env.stripe && !!p.priceId,
    })),
  };
}
