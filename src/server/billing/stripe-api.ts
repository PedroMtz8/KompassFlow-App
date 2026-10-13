import { env } from '../env';

type Opts = {
  idempotencyKey?: string;
  /** Cuenta conectada en cuyo nombre se hace la llamada (cargos directos y reembolsos de la academia). */
  account?: string;
};

const STRIPE_V2_VERSION = '2026-09-30.endive';

async function send(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const json = (await r.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!r.ok) throw Object.assign(new Error(json.error?.message ?? `Stripe ${r.status}`), { code: json.error?.code, status: r.status });
  return json as Record<string, any>;
}

/** Llamada mínima al API v1 de Stripe con fetch (portable: sin el SDK, que pesa decenas de MB). Lanza si Stripe rechaza. */
export async function stripeCall(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, string>, opts: Opts = {}) {
  const cfg = env.stripe;
  if (!cfg) throw new Error('Stripe no está configurado');
  return send(`${env.stripeApiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
      ...(opts.account ? { 'stripe-account': opts.account } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
}

/** Llamada al API v2 (Accounts v2: cuentas conectadas de las academias). El cuerpo va en JSON. */
export async function stripeV2(method: 'GET' | 'POST', path: string, json?: unknown, opts: Opts = {}) {
  const cfg = env.stripe;
  if (!cfg) throw new Error('Stripe no está configurado');
  return send(`${env.stripeApiBase.replace(/\/v1$/, '/v2')}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      'stripe-version': STRIPE_V2_VERSION,
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

/** Cancela de inmediato las suscripciones vigentes de una academia. Las que Stripe ya no tiene cuentan como canceladas. */
export async function cancelOrgSubscriptions(subscriptionIds: string[]) {
  for (const id of subscriptionIds) {
    try {
      await stripeCall('DELETE', `/subscriptions/${id}`);
    } catch (e) {
      if ((e as { code?: string }).code !== 'resource_missing') throw e;
    }
  }
}
