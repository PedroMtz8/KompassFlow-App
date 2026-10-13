import { env } from '../env';
import { db, schema } from '../db';
import { PAID_PLANS, PLANS, type PlanDef, type PlanKey } from './plans';

/** Un plan ya resuelto: los valores del código, sobreescritos por lo que el administrador guardó en la base. */
export type PlanConfig = PlanDef & {
  /** Comisión sobre los cobros con tarjeta de los alumnos (puntos base, 100 = 1%). */
  cardFeeBps: number;
  /** Precio vigente en Stripe (y los anteriores, que siguen contando como de este plan). */
  priceId: string | undefined;
  retiredPriceIds: string[];
};

const TTL_MS = 15_000;
let cache: { at: number; plans: Record<PlanKey, PlanConfig> } | null = null;

/** Se llama al guardar un ajuste, para que el cambio se vea de inmediato en esta instancia. */
export const invalidatePlans = () => {
  cache = null;
};

const parseIds = (raw: string | null) => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Planes con los ajustes del administrador aplicados (en memoria unos segundos; los cambios se propagan solos entre instancias). */
export async function getPlans(): Promise<Record<PlanKey, PlanConfig>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.plans;
  const rows = await db.select().from(schema.planSetting);
  const by = new Map(rows.map((r) => [r.plan, r]));
  const lim = (v: number | null | undefined, fallback: number) => (v == null ? fallback : v < 0 ? Infinity : v);
  const plans = Object.fromEntries(
    (Object.keys(PLANS) as PlanKey[]).map((key) => {
      const d = PLANS[key];
      const r = by.get(key);
      const cfg: PlanConfig = {
        ...d,
        priceMxn: r?.priceMxn ?? d.priceMxn,
        trialDays: r?.trialDays ?? d.trialDays,
        limits: {
          students: lim(r?.maxStudents, d.limits.students),
          members: lim(r?.maxMembers, d.limits.members),
          locations: lim(r?.maxLocations, d.limits.locations),
          reports: r?.reports ?? d.limits.reports,
        },
        cardFeeBps: r?.cardFeeBps ?? env.feeBpsFor(key),
        priceId: r?.stripePriceId ?? (key === 'free' ? undefined : env.stripePrices[key as 'starter' | 'pro' | 'business']),
        retiredPriceIds: parseIds(r?.retiredPriceIds ?? null),
      };
      return [key, cfg];
    })
  ) as Record<PlanKey, PlanConfig>;
  cache = { at: Date.now(), plans };
  return plans;
}

/** Planes para el plugin de Stripe (solo los que ya tienen precio en Stripe). */
export async function stripePlans() {
  const plans = await getPlans();
  return PAID_PLANS.filter((k) => plans[k].priceId).map((k) => ({
    name: k,
    priceId: plans[k].priceId!,
    freeTrial: { days: plans[k].trialDays },
    // JSON no admite Infinity: se guarda null = sin límite.
    limits: Object.fromEntries(Object.entries(plans[k].limits).map(([a, b]) => [a, b === Infinity ? null : b])),
  }));
}

/** ¿A qué plan corresponde un precio de Stripe? (el vigente o uno anterior). */
export async function planOfPrice(priceId: string | undefined) {
  if (!priceId) return undefined;
  const plans = await getPlans();
  return PAID_PLANS.find((k) => plans[k].priceId === priceId || plans[k].retiredPriceIds.includes(priceId));
}
