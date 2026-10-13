/**
 * Prueba de los planes SaaS contra el Stripe de PRUEBA real (necesita red y claves; por eso no está en `bun run test`):
 *  - contratar un plan abre un Checkout de suscripción en MXN con el precio y la prueba gratis del plan;
 *  - solo el propietario puede contratar;
 *  - una suscripción creada en Stripe llega por webhook (firmado) y cambia el plan y los límites de la academia;
 *  - cancelarla en Stripe regresa la academia al plan Gratis.
 * Usa un usuario y una academia temporales (y su cliente en Stripe) que se borran al final.
 *   stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:8099/api/auth/stripe/webhook   (otra terminal)
 *   bun --env-file=.env scripts/serve-api.ts 8099 &   y luego   bun --env-file=.env scripts/stripe-plans-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { getBilling } from '../src/server/db/billing';
import { deleteOrganization } from '../src/server/db/account-deletion';
import { createOrganization } from '../src/server/db/organizations';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_')) throw new Error('Solo con claves de prueba (sk_test_…).');
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-stp-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const stripe = async (path: string, body?: Record<string, string>, method = body ? 'POST' : 'GET') => {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const j = (await r.json()) as any;
  if (!r.ok) throw new Error(`${path}: ${j.error?.message}`);
  return j;
};
const wait = async (cond: () => Promise<boolean>, ms = 25_000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
};

const userIds: string[] = [];
let orgId = '';
let customerId = '';
try {
  const mk = async (label: string) => {
    const r = await api.handle(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }),
      })
    );
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    return { id, cookie };
  };
  const owner = await mk('owner');
  const other = await mk('other');
  const org = await createOrganization(owner.id, { name: `ZZ Stp ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  const post = async (cookie: string, path: string, body: unknown) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify(body) }));
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };

  let b = await getBilling(orgId);
  out.push(['Sin suscripción rige el plan Gratis', b.enabled && b.plan === 'free', `${b.plan}`]);

  const denied = await post(other.cookie, '/auth/subscription/upgrade', { plan: 'pro', referenceId: orgId, customerType: 'organization', successUrl: 'http://localhost:8081/plan', cancelUrl: 'http://localhost:8081/plan', disableRedirect: true });
  out.push(['Quien no es propietario no puede contratar', denied.status >= 400 && !denied.json.url, `${denied.status}`]);

  const up = await post(owner.cookie, '/auth/subscription/upgrade', { plan: 'pro', referenceId: orgId, customerType: 'organization', successUrl: 'http://localhost:8081/plan', cancelUrl: 'http://localhost:8081/plan', disableRedirect: true });
  out.push(['El propietario recibe una URL de Checkout', up.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(up.json.url ?? ''), `${up.status}`]);
  const sessionId = String(up.json.url ?? '').match(/cs_test_[A-Za-z0-9]+/)?.[0];
  if (sessionId) {
    const s = await stripe(`/checkout/sessions/${sessionId}?expand[]=line_items`);
    out.push(['Es una suscripción en MXN de $249 al mes', s.mode === 'subscription' && s.currency === 'mxn' && s.line_items.data[0].price.unit_amount === 24900, `${s.mode} ${s.currency}`]);
  }

  const row = await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) });
  customerId = row?.stripeCustomerId ?? '';
  out.push(['La academia (no la persona) queda como cliente en Stripe', customerId.startsWith('cus_'), customerId]);

  // Pago con tarjeta de prueba: se crea la suscripción directo en Stripe y debe llegar el webhook.
  const pm = await stripe('/payment_methods', { type: 'card', 'card[token]': 'tok_visa' });
  await stripe(`/payment_methods/${pm.id}/attach`, { customer: customerId });
  await stripe(`/customers/${customerId}`, { 'invoice_settings[default_payment_method]': pm.id });
  const price = (await stripe('/prices?lookup_keys[]=stagelight_pro_monthly')).data[0];
  const sub = await stripe('/subscriptions', {
    customer: customerId,
    'items[0][price]': price.id,
    'metadata[referenceId]': orgId,
    'metadata[subscriptionId]': 'x',
  });
  const upgraded = await wait(async () => (await getBilling(orgId)).plan === 'pro');
  b = await getBilling(orgId);
  out.push(['El webhook cambia la academia a Pro', upgraded, `${b.plan} ${b.status}`]);
  out.push(['Los límites son los de Pro', b.limits.students === 400 && b.limits.members === 15, JSON.stringify(b.limits)]);

  await stripe(`/subscriptions/${sub.id}`, undefined, 'DELETE');
  const downgraded = await wait(async () => (await getBilling(orgId)).plan === 'free');
  out.push(['Al cancelar en Stripe vuelve al plan Gratis', downgraded]);

  // ── Eliminar la academia cancela su suscripción ─────────────────────────────
  const sub2 = await stripe('/subscriptions', { customer: customerId, 'items[0][price]': price.id, 'metadata[referenceId]': orgId, 'metadata[subscriptionId]': 'x' });
  await wait(async () => (await getBilling(orgId)).plan === 'pro');
  const del = await deleteOrganization(owner.id, orgId, `ZZ Stp ${tag}`);
  const after = await stripe(`/subscriptions/${sub2.id}`);
  out.push(['Eliminar la academia cancela su suscripción en Stripe', 'ok' in del && after.status === 'canceled', `${after.status}`]);
  out.push(['La academia ya no existe', !(await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) }))]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (customerId) await stripe(`/customers/${customerId}`, undefined, 'DELETE').catch(() => {});
  if (orgId) {
    await db.delete(schema.subscription).where(eq(schema.subscription.referenceId, orgId));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
  if (userIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  process.exit(process.exitCode ?? 0);
}
