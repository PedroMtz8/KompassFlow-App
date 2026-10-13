/**
 * Planes SaaS de las academias (PRD §12). Los límites viven aquí; el plan vigente sale de la
 * suscripción en Stripe (plugin de Better Auth) y nunca se copia a mano en la base de datos.
 * `Infinity` = sin límite. Los precios son hipótesis a validar.
 */
export type PlanKey = 'free' | 'starter' | 'pro' | 'business';

export type PlanLimits = {
  /** Alumnos registrados (Student) en la organización. */
  students: number;
  /** Miembros del equipo (propietario incluido). */
  members: number;
  /** Ubicaciones físicas. */
  locations: number;
  /** Acceso a reportes. */
  reports: boolean;
};

export type PlanDef = { key: PlanKey; name: string; priceMxn: number; trialDays: number; limits: PlanLimits };

export const PLANS: Record<PlanKey, PlanDef> = {
  free: { key: 'free', name: 'Gratis', priceMxn: 0, trialDays: 0, limits: { students: 25, members: 2, locations: 1, reports: false } },
  starter: {
    key: 'starter',
    name: 'Starter',
    priceMxn: 99,
    trialDays: 14,
    limits: { students: 60, members: 3, locations: 1, reports: false },
  },
  pro: { key: 'pro', name: 'Pro', priceMxn: 249, trialDays: 14, limits: { students: 400, members: 15, locations: 2, reports: true } },
  business: {
    key: 'business',
    name: 'Business',
    priceMxn: 499,
    trialDays: 14,
    limits: { students: Infinity, members: Infinity, locations: Infinity, reports: true },
  },
};

export const PAID_PLANS: PlanKey[] = ['starter', 'pro', 'business'];

export const isPlanKey = (v: string): v is PlanKey => v in PLANS;
