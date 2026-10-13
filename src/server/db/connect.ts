import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { stripeCall, stripeV2 } from '../billing/stripe-api';
import { env } from '../env';
import { ensureStudentForUser } from './bookings';
import { getOrgPlan } from './billing';
import { db, schema } from './index';
import { money, notifyStudent } from './notifications';
import { auditStatement } from './organizations';
import { passStatement } from './payments';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/**
 * Cobro con tarjeta de los alumnos a la academia (Stripe Connect). Cada academia tiene una cuenta conectada (Accounts v2,
 * con el panel completo de Stripe) en la que Stripe asume las pérdidas ("Managed Risk"); el cobro es DIRECTO a esa cuenta
 * y la plataforma puede retener una comisión (`PLATFORM_FEE_BPS`, 0 por defecto). Los eventos de esas cuentas llegan con
 * `event.account`: solo se aceptan si coincide con la cuenta guardada de la academia que nombra el pago.
 * Todo lo que crea un pago es idempotente: el id del pago y del pase salen de la sesión de Checkout, así un webhook
 * repetido, o el aviso de la app y el webhook a la vez, nunca duplican nada.
 */

export const connectAvailable = () => !!env.stripe;

const row = (orgId: string) => db.query.paymentSettings.findFirst({ where: eq(schema.paymentSettings.organizationId, orgId) });

const setFlags = (orgId: string, a: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }) =>
  db
    .update(schema.paymentSettings)
    .set({
      stripeChargesEnabled: a.chargesEnabled,
      stripePayoutsEnabled: a.payoutsEnabled,
      stripeDetailsSubmitted: a.detailsSubmitted,
    })
    .where(eq(schema.paymentSettings.organizationId, orgId));

type V2Account = {
  closed?: boolean;
  configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string }; stripe_balance?: { payouts?: { status?: string } } } } };
  requirements?: { entries?: { awaiting_action_from?: string }[] };
};

const flagsOf = (a: V2Account) => {
  const cap = a.configuration?.merchant?.capabilities;
  return {
    chargesEnabled: !a.closed && cap?.card_payments?.status === 'active',
    payoutsEnabled: !a.closed && cap?.stripe_balance?.payouts?.status === 'active',
    // "Datos enviados" = Stripe ya no espera nada de la persona.
    detailsSubmitted: !(a.requirements?.entries ?? []).some((e) => e.awaiting_action_from === 'user'),
  };
};

/** Estado de la cuenta de cobro de la academia, sincronizado con Stripe. */
export async function connectStatus(organizationId: string) {
  if (!connectAvailable()) return { available: false as const };
  const s = await row(organizationId);
  if (!s?.stripeAccountId) return { available: true as const, connected: false as const, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  try {
    const a = (await stripeV2('GET', `/core/accounts/${s.stripeAccountId}?include=configuration.merchant&include=requirements`)) as V2Account;
    const f = flagsOf(a);
    await setFlags(organizationId, f);
    return { available: true as const, connected: true as const, ...f };
  } catch {
    // Si Stripe no responde se muestra lo último que se sabía.
    return {
      available: true as const,
      connected: true as const,
      chargesEnabled: s.stripeChargesEnabled,
      payoutsEnabled: s.stripePayoutsEnabled,
      detailsSubmitted: s.stripeDetailsSubmitted,
    };
  }
}

/** Crea la cuenta conectada de la academia (una sola) y devuelve el enlace de Stripe para completar o retomar sus datos. */
export async function startOnboarding(actorId: string, organizationId: string, urls: { returnUrl: string; refreshUrl: string }) {
  if (!connectAvailable()) return { error: 'UNAVAILABLE' as const };
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  if (!org) return { error: 'NOT_FOUND' as const };
  let s = await row(organizationId);
  if (!s?.stripeAccountId) {
    const actor = await db.query.user.findFirst({ where: eq(schema.user.id, actorId), columns: { email: true } });
    // La llave de idempotencia evita dos cuentas si se toca el botón dos veces seguidas.
    const acct = (await stripeV2(
      'POST',
      '/core/accounts',
      {
        display_name: org.name.slice(0, 100),
        ...(actor?.email ? { contact_email: actor.email } : {}),
        identity: { country: 'mx' },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        // Stripe cobra sus comisiones y asume las pérdidas (Managed Risk); la academia usa el panel completo de Stripe.
        defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
        dashboard: 'full',
        metadata: { organizationId },
      },
      { idempotencyKey: `connect-account-${organizationId}` }
    )) as { id: string };
    await db
      .insert(schema.paymentSettings)
      .values({ organizationId, stripeAccountId: acct.id })
      .onConflictDoUpdate({ target: schema.paymentSettings.organizationId, set: { stripeAccountId: acct.id } });
    await auditStatement({ organizationId, actorUserId: actorId, action: 'connect.account_created', entityType: 'organization', entityId: organizationId });
    s = await row(organizationId);
  }
  const link = (await stripeV2('POST', '/core/account_links', {
    account: s!.stripeAccountId!,
    use_case: { type: 'account_onboarding', account_onboarding: { return_url: urls.returnUrl, refresh_url: urls.refreshUrl } },
  })) as { url: string };
  return { url: link.url };
}

/** La academia usa el panel completo de Stripe (pagos recibidos, depósitos, datos bancarios): se entra con su propia cuenta. */
export async function dashboardLink(organizationId: string) {
  const s = await row(organizationId);
  if (!connectAvailable() || !s?.stripeAccountId) return { error: 'NOT_CONNECTED' as const };
  return { url: 'https://dashboard.stripe.com/' };
}

export type CardCheckoutFail = 'NOT_FOUND' | 'CARD_NOT_ACCEPTED' | 'FREE_PRODUCT';

/** El alumno quiere pagar un producto con tarjeta: crea la sesión de Checkout cobrando a la cuenta de la academia. */
export async function createCardCheckout(
  u: { id: string; name: string; email: string },
  productId: string,
  urls: { successUrl: string; cancelUrl: string }
) {
  const product = await db.query.product.findFirst({
    where: and(eq(schema.product.id, productId), eq(schema.product.isActive, true), eq(schema.product.isVisible, true)),
  });
  if (!product) return { error: 'NOT_FOUND' as const };
  const pub = await db.query.organizationDetail.findFirst({
    where: and(eq(schema.organizationDetail.organizationId, product.organizationId), eq(schema.organizationDetail.isPublished, true)),
  });
  if (!pub) return { error: 'NOT_FOUND' as const };
  if (!connectAvailable()) return { error: 'CARD_NOT_ACCEPTED' as const };
  // Se vuelve a preguntar a Stripe: el aviso guardado pudo cambiar (cuenta restringida, por ejemplo).
  const st = await connectStatus(product.organizationId);
  const s = await row(product.organizationId);
  if (!('connected' in st) || !st.connected || !st.chargesEnabled || !s?.stripeAccountId) return { error: 'CARD_NOT_ACCEPTED' as const };
  if (product.priceCents < 1000) return { error: 'FREE_PRODUCT' as const }; // Stripe pide mínimo $10 MXN

  const studentId = await ensureStudentForUser(product.organizationId, u);
  // La comisión depende del plan de la academia (puede ser 0 en los planes más altos).
  const fee = Math.round((product.priceCents * (await getOrgPlan(product.organizationId)).def.cardFeeBps) / 10_000);
  const session = (await stripeCall(
    'POST',
    '/checkout/sessions',
    {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': pub.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(product.priceCents),
    'line_items[0][price_data][product_data][name]': product.name.slice(0, 120),
    ...(fee > 0 ? { 'payment_intent_data[application_fee_amount]': String(fee) } : {}),
    customer_email: u.email,
    // `acct` viaja de regreso para saber en qué cuenta buscar la sesión; se valida contra la cuenta guardada de la academia.
    success_url: `${urls.successUrl}${urls.successUrl.includes('?') ? '&' : '?'}acct=${s.stripeAccountId}`,
    cancel_url: urls.cancelUrl,
    'metadata[kind]': 'product',
    'metadata[organizationId]': product.organizationId,
    'metadata[studentId]': studentId,
    'metadata[productId]': product.id,
    'metadata[userId]': u.id,
    'metadata[fee]': String(fee),
    },
    // Cobro directo: la sesión y el pago viven en la cuenta de la academia.
    { account: s.stripeAccountId }
  )) as { id: string; url: string };
  return { url: session.url, sessionId: session.id };
}

type Session = {
  id: string;
  payment_status: string;
  amount_total: number | null;
  payment_intent: string | null;
  metadata: Record<string, string> | null;
};

/**
 * Convierte una sesión de Checkout pagada en el pago y el pase. Se puede llamar las veces que sea (webhook, aviso de la
 * app, reintentos): el pago y el pase usan ids derivados de la sesión, así que la segunda vez no hace nada.
 * `accountId` es la cuenta conectada donde vive la sesión; `forUserId` limita el aviso desde la app a las de esa persona.
 */
export async function fulfillCheckout(sessionId: string, accountId: string, forUserId?: string) {
  let session: Session;
  try {
    session = (await stripeCall('GET', `/checkout/sessions/${sessionId}`, undefined, { account: accountId })) as Session;
  } catch (e) {
    // Sesión o cuenta que no existen (o que no son de esta plataforma): no es un pago nuestro. Los fallos de red sí se reintentan.
    const st = (e as { status?: number }).status;
    if (st === 400 || st === 403 || st === 404) return { status: 'ignored' as const };
    throw e;
  }
  const m = session.metadata ?? {};
  if (m.kind !== 'product' || !m.organizationId || !m.studentId) return { status: 'ignored' as const };
  if (forUserId && m.userId !== forUserId) return { status: 'ignored' as const };
  // La sesión debe ser de la cuenta conectada de ESA academia: nadie puede acreditarse un pago creando una sesión en otra cuenta.
  const owner = await row(m.organizationId);
  if (!owner?.stripeAccountId || owner.stripeAccountId !== accountId) return { status: 'ignored' as const };
  if (session.payment_status !== 'paid') return { status: 'unpaid' as const };

  const student = await db.query.student.findFirst({
    where: and(eq(schema.student.id, m.studentId), eq(schema.student.organizationId, m.organizationId)),
  });
  // La persona o la academia se borraron entre el pago y el aviso: no hay dónde registrarlo (Stripe conserva el cobro).
  if (!student) return { status: 'ignored' as const };
  const product = m.productId ? ((await db.query.product.findFirst({ where: eq(schema.product.id, m.productId) })) ?? null) : null;
  const paidAt = new Date();
  const paymentId = `stripe_${session.id}`;
  const pass = passStatement({ id: `pass_${session.id}`, organizationId: m.organizationId, studentId: student.id, paymentId, product, paidAt });
  const concept = product?.name ?? 'Pago con tarjeta';

  const inserted = await db
    .insert(schema.payment)
    .values({
      id: paymentId,
      organizationId: m.organizationId,
      studentId: student.id,
      productId: product?.id ?? null,
      concept,
      amountCents: session.amount_total ?? product?.priceCents ?? 0,
      method: 'CARD',
      status: 'PAID',
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      feeCents: Number(m.fee ?? 0) || 0,
      createdBy: m.userId ?? null,
      paidAt,
    })
    .onConflictDoNothing()
    .returning({ id: schema.payment.id });
  // El pase se intenta siempre (su id sale de la sesión, así que no se duplica): si un aviso anterior se cayó entre el
  // pago y el pase, este lo completa.
  if (pass) await pass;
  if (!inserted.length) return { status: 'already' as const, organizationId: m.organizationId, concept };
  // Tipo de tarjeta (crédito/débito) para la administración de la plataforma; si Stripe no responde se completa después.
  await captureCardInfo(paymentId, session.payment_intent, accountId).catch(() => null);
  await auditStatement({
    organizationId: m.organizationId,
    actorUserId: m.userId ?? null,
    action: 'payment.card_received',
    entityType: 'payment',
    entityId: paymentId,
    metadata: { studentId: student.id, amountCents: session.amount_total, concept },
  });
  const detail = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, m.organizationId), columns: { currency: true } });
  await notifyStudent(student.id, null, {
    category: 'payment',
    organizationId: m.organizationId,
    title: 'Pago recibido',
    body: `${concept} · ${money(session.amount_total ?? 0, detail?.currency ?? 'MXN')}. Tu paquete ya está activo.`,
    url: '/membership',
  });
  return { status: 'paid' as const, organizationId: m.organizationId, concept };
}

/** Guarda si el pago fue con tarjeta de crédito o débito (y su marca), tomado del cargo en Stripe. */
export async function captureCardInfo(paymentId: string, paymentIntentId: string | null | undefined, accountId: string) {
  if (!paymentIntentId) return false;
  const pi = (await stripeCall('GET', `/payment_intents/${paymentIntentId}?expand[]=latest_charge`, undefined, { account: accountId })) as {
    latest_charge?: { payment_method_details?: { card?: { funding?: string; brand?: string } } } | null;
  };
  const card = pi.latest_charge?.payment_method_details?.card;
  if (!card?.funding) return false;
  await db.update(schema.payment).set({ cardFunding: card.funding, cardBrand: card.brand ?? null }).where(eq(schema.payment.id, paymentId));
  return true;
}

/** Completa el tipo de tarjeta de los pagos que aún no lo tienen (los anteriores a que se guardara). */
export async function backfillCardInfo(limit = 50) {
  const rows = await db
    .select({ id: schema.payment.id, pi: schema.payment.stripePaymentIntentId, acct: schema.paymentSettings.stripeAccountId })
    .from(schema.payment)
    .innerJoin(schema.paymentSettings, eq(schema.paymentSettings.organizationId, schema.payment.organizationId))
    .where(and(eq(schema.payment.method, 'CARD'), isNull(schema.payment.cardFunding), isNotNull(schema.payment.stripePaymentIntentId)))
    .limit(limit);
  let done = 0;
  for (const r of rows) if (r.acct && (await captureCardInfo(r.id, r.pi, r.acct).catch(() => false))) done++;
  return { checked: rows.length, updated: done };
}

export type RefundFail = 'NOT_FOUND' | 'NOT_CARD' | 'NOT_PAID' | 'STRIPE_FAILED';

/** Reembolsa un pago con tarjeta: devuelve el dinero al alumno (a cargo de la academia) y vence el pase que dio. */
export async function refundCardPayment(actorId: string, organizationId: string, paymentId: string) {
  const pay = await db.query.payment.findFirst({
    where: and(eq(schema.payment.id, paymentId), eq(schema.payment.organizationId, organizationId)),
  });
  if (!pay) return { error: 'NOT_FOUND' as const };
  if (pay.method !== 'CARD' || !pay.stripePaymentIntentId) return { error: 'NOT_CARD' as const };
  if (pay.status !== 'PAID') return { error: 'NOT_PAID' as const };
  const acct = (await row(organizationId))?.stripeAccountId;
  if (!acct) return { error: 'STRIPE_FAILED' as const };
  try {
    // El reembolso se hace en la cuenta de la academia (donde vive el cobro) y devuelve también la comisión de la plataforma.
    await stripeCall(
      'POST',
      '/refunds',
      { payment_intent: pay.stripePaymentIntentId, ...(pay.feeCents > 0 ? { refund_application_fee: 'true' } : {}) },
      { idempotencyKey: `refund-${pay.id}`, account: acct }
    );
  } catch {
    return { error: 'STRIPE_FAILED' as const };
  }
  await markRefunded(pay.id, actorId);
  return { ok: true as const };
}

/** Marca el pago como reembolsado y vence su pase (los créditos ya usados quedan en el historial). */
async function markRefunded(paymentId: string, actorId: string | null) {
  const pay = await db.query.payment.findFirst({ where: eq(schema.payment.id, paymentId) });
  if (!pay || pay.status === 'REFUNDED') return;
  const now = new Date();
  await db.batch([
    db.update(schema.payment).set({ status: 'REFUNDED', refundedAt: now }).where(eq(schema.payment.id, paymentId)),
    db.update(schema.studentPass).set({ expiresAt: now }).where(eq(schema.studentPass.paymentId, paymentId)),
    auditStatement({
      organizationId: pay.organizationId,
      actorUserId: actorId,
      action: 'payment.refunded',
      entityType: 'payment',
      entityId: paymentId,
      metadata: { amountCents: pay.amountCents },
    }),
  ] as Batch);
  await notifyStudent(pay.studentId, actorId, {
    category: 'payment',
    organizationId: pay.organizationId,
    title: 'Te reembolsaron un pago',
    body: `${pay.concept}. El dinero llega a tu tarjeta en unos días.`,
    url: '/membership',
  });
}

/**
 * Eventos de las cuentas conectadas de las academias (cobros directos). Llevan `event.account`; los eventos de la
 * plataforma (suscripciones SaaS) los atiende el plugin de Better Auth y aquí se ignoran.
 */
export async function handleStripeEvent(event: { type: string; account?: string; data: { object: Record<string, unknown> } }) {
  const o = event.data.object;
  if (!event.account) return;
  if (event.type === 'checkout.session.completed' && (o.metadata as Record<string, string> | null)?.kind === 'product') {
    await fulfillCheckout(String(o.id), event.account);
  } else if (event.type === 'charge.refunded' && o.payment_intent) {
    const pay = await db.query.payment.findFirst({ where: eq(schema.payment.stripePaymentIntentId, String(o.payment_intent)) });
    const acct = pay ? (await row(pay.organizationId))?.stripeAccountId : null;
    // Solo si se devolvió todo (un reembolso parcial desde Stripe no cambia el estado) y viene de la cuenta de esa academia.
    if (pay && acct === event.account && o.refunded === true) await markRefunded(pay.id, null);
  }
}
