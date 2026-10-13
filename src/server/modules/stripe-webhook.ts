import { Elysia } from 'elysia';

import { handleStripeEvent } from '../db/connect';
import { env } from '../env';
import { reportError } from '../lib/report';

/**
 * Webhook de Stripe para los eventos de las CUENTAS CONECTADAS de las academias (cobros con tarjeta de los alumnos).
 * Los eventos de la plataforma (suscripciones SaaS) llegan al webhook de Better Auth (`/api/auth/stripe/webhook`); Stripe
 * da un secreto distinto a cada destino, por eso este endpoint tiene el suyo (`STRIPE_CONNECT_WEBHOOK_SECRET`; si no se
 * define se usa `STRIPE_WEBHOOK_SECRET`, que es el caso de `stripe listen` en desarrollo).
 *
 * La firma se verifica a mano (HMAC-SHA256 sobre `timestamp.cuerpo`), sin el SDK de Stripe, con tolerancia de 5 minutos.
 */
const TOLERANCE_S = 300;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

/** Comparación en tiempo constante (no revela cuántos caracteres acertó). */
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const expected = await sign(secret, `${t}.${rawBody}`);
  // Stripe puede mandar varias firmas v1 (rotación de secretos): basta con que una coincida.
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => same(p.slice(3), expected));
}

export const stripeWebhookModule = new Elysia({ name: 'stripe-webhook' }).post(
  '/stripe/connect-webhook',
  async ({ request, status }) => {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || env.stripe?.webhookSecret;
    if (!secret) return status(503, { message: 'Stripe no está configurado.' });
    const raw = await request.text();
    if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret))) return status(400, { message: 'Firma inválida.' });
    try {
      await handleStripeEvent(JSON.parse(raw));
    } catch (e) {
      // 500: Stripe reintenta el evento (el registro del pago es idempotente).
      reportError(e, { source: 'stripe-webhook' });
      return status(500, { message: 'No se pudo procesar el evento.' });
    }
    return { received: true as const };
  },
  { parse: 'none' }
);
