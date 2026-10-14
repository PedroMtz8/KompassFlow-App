import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { connectStatus, createCardCheckout, dashboardLink, fulfillCheckout, refundCardPayment, startOnboarding } from '../db/connect';
import { authorize, getMemberRole } from '../db/organizations';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

/** Solo http(s) o el esquema de la app: los enlaces de regreso los usa Stripe para redirigir a la persona. */
const url = t.String({ maxLength: 600, pattern: '^(https?|exp|exps|kompassflow)://' });
const TOO_MANY = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';

const cardErrors = {
  NOT_FOUND: [404, 'Este producto ya no está disponible.'],
  CARD_NOT_ACCEPTED: [409, 'Esta academia aún no recibe pagos con tarjeta.'],
  FREE_PRODUCT: [422, 'Este producto no se puede pagar con tarjeta (el monto mínimo es de $10).'],
} as const;

const refundErrors = {
  NOT_FOUND: [404, 'No encontrado.'],
  NOT_CARD: [409, 'Solo se reembolsan desde aquí los pagos con tarjeta.'],
  NOT_PAID: [409, 'Este pago no está cobrado o ya se reembolsó.'],
  STRIPE_FAILED: [502, 'Stripe no pudo hacer el reembolso. No se cambió nada: inténtalo de nuevo en un momento.'],
} as const;

/** Cobros con tarjeta (Stripe Connect): cuenta de la academia, pago del alumno y reembolsos. */
export const connectModule = new Elysia({ name: 'connect' })
  .use(authPlugin)

  /**
   * Página de regreso para Stripe en celular: sus enlaces solo admiten http(s), así que Stripe vuelve aquí y esta página
   * abre la app con su enlace propio. Solo se acepta el esquema de la app (no es una redirección abierta a cualquier sitio).
   */
  .get(
    '/stripe/return',
    ({ query, set }) => {
      set.headers['content-type'] = 'text/html; charset=utf-8';
      set.headers['cache-control'] = 'no-store';
      // Stripe agrega `session_id` y la cuenta (`acct`) a este enlace; se reenvían a la app (ya validados).
      const extra = [query.session_id && `session_id=${query.session_id}`, query.acct && `acct=${query.acct}`].filter(Boolean).join('&');
      const to = extra ? `${query.to}${query.to.includes('?') ? '&' : '?'}${extra}` : query.to;
      const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volver a KompassFlow</title><meta http-equiv="refresh" content="0;url=${esc(to)}"></head><body style="font-family:system-ui;text-align:center;padding:48px 24px"><h2>Listo</h2><p>Regresa a KompassFlow para continuar.</p><p><a href="${esc(to)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#E8590C;color:#fff;text-decoration:none;font-weight:700">Abrir KompassFlow</a></p></body></html>`;
    },
    { query: t.Object({ acct: t.Optional(t.String({ pattern: '^acct_[A-Za-z0-9]{6,100}$' })), session_id: t.Optional(t.String({ pattern: '^cs_[A-Za-z0-9_]{6,200}$' })), to: t.String({ maxLength: 700, pattern: '^(exp|exps|stagelight)://[^\\s<>"\']*$' }) }) }
  )

  /* ── Lado organización ── */
  .get(
    '/orgs/:id/connect',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'payment', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return connectStatus(params.id);
    },
    { auth: true }
  )
  .post(
    '/orgs/:id/connect/onboard',
    async ({ user, params, body, status }) => {
      // La cuenta de cobro (dónde se depositan los pagos) la maneja solo la persona propietaria.
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (role !== 'owner') return status(403, { message: 'Solo la persona propietaria puede configurar los cobros con tarjeta.' });
      if (!await allow(`connect:${user.id}`, 10, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await startOnboarding(user.id, params.id, body);
      if (hasError(r)) return status(409, { message: 'Los cobros con tarjeta no están disponibles en este momento.' });
      return r;
    },
    { auth: true, body: t.Object({ returnUrl: url, refreshUrl: url }) }
  )
  .post(
    '/orgs/:id/connect/dashboard',
    async ({ user, params, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (role !== 'owner') return status(403, { message: 'Solo la persona propietaria puede abrir el panel de cobros.' });
      if (!await allow(`connect:${user.id}`, 10, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await dashboardLink(params.id);
      if (hasError(r)) return status(409, { message: 'Primero conecta tu cuenta de cobros.' });
      return r;
    },
    { auth: true }
  )
  .post(
    '/orgs/:id/payments/:paymentId/refund',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'payment', 'refund'))) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`refund:${user.id}`, 10, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await refundCardPayment(user.id, params.id, params.paymentId);
      if (hasError(r)) return status(refundErrors[r.error][0], { message: refundErrors[r.error][1] });
      return r;
    },
    { auth: true }
  )

  /* ── Lado persona ── */
  .post(
    '/discover/products/:id/card-checkout',
    async ({ user, params, body, status }) => {
      if (!await allow(`cardpay:${user.id}`, 10, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await createCardCheckout(user, params.id, body);
      if (hasError(r)) return status(cardErrors[r.error][0], { message: cardErrors[r.error][1] });
      return { url: r.url };
    },
    { auth: true, body: t.Object({ successUrl: url, cancelUrl: url }) }
  )
  // Al volver de Stripe la app avisa aquí (el webhook hace lo mismo; el primero que llegue registra el pago).
  .post(
    '/me/checkout/confirm',
    async ({ user, body, status }) => {
      if (!await allow(`confirmpay:${user.id}`, 30, 10 * 60_000)) return status(429, { message: TOO_MANY });
      try {
        const r = await fulfillCheckout(body.sessionId, body.accountId, user.id);
        return { status: r.status, concept: 'concept' in r ? r.concept : null };
      } catch {
        return status(502, { message: 'No pudimos confirmar tu pago todavía. Si ya pagaste, aparecerá en unos minutos.' });
      }
    },
    { auth: true, body: t.Object({ sessionId: t.String({ minLength: 10, maxLength: 200, pattern: '^cs_' }), accountId: t.String({ minLength: 5, maxLength: 100, pattern: '^acct_' }) }) }
  );
