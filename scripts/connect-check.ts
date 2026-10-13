/**
 * Prueba de los cobros con tarjeta (Stripe Connect) con un Stripe FALSO local (sin red ni dinero):
 *  - solo la persona propietaria conecta la cuenta; se crea una sola cuenta aunque se toque dos veces;
 *  - sin cuenta lista no se puede cobrar; con ella el Checkout cobra a la cuenta de la academia con la comisión configurada;
 *  - un pago confirmado crea UN pago y UN pase aunque el aviso llegue varias veces a la vez (webhook + app);
 *  - un pago sin cobrar no crea nada y nadie confirma pagos de otra persona;
 *  - el reembolso exige permiso, devuelve el dinero, vence el pase y no se repite; si Stripe falla no cambia nada.
 *   bun --env-file=.env scripts/connect-check.ts
 */
import { invalidatePlans } from '../src/server/billing/plan-config';
import { eq, inArray } from 'drizzle-orm';

type Rec = { method: string; path: string; body: URLSearchParams; json: any; headers: Headers };
const calls: Rec[] = [];
const flags = { charges: false, payouts: false, failRefund: false };
const sessions = new Map<string, { metadata: Record<string, string>; paid: boolean; pi: string; amount: number; acct: string }>();
let sessionSeq = 0;

declare const Bun: { serve: (o: { port: number; fetch: (r: Request) => Response | Promise<Response> }) => { port: number; stop: (force?: boolean) => void } };

const fake = Bun.serve({
  port: 0,
  async fetch(req: Request) {
    const u = new URL(req.url);
    const path = u.pathname;
    const raw = await req.text();
    const isJson = (req.headers.get('content-type') ?? '').includes('json');
    const body = new URLSearchParams(isJson ? '' : raw);
    const rec: Rec = { method: req.method, path, body, json: isJson && raw ? JSON.parse(raw) : null, headers: req.headers };
    calls.push(rec);
    const json = (o: unknown, status = 200) => Response.json(o, { status });
    const acct = req.headers.get('stripe-account');
    if (path === '/v2/core/accounts' && req.method === 'POST') return json({ id: 'acct_fake1' });
    if (path === '/v2/core/accounts/acct_fake1')
      return json({
        id: 'acct_fake1',
        closed: false,
        configuration: { merchant: { capabilities: { card_payments: { status: flags.charges ? 'active' : 'restricted' }, stripe_balance: { payouts: { status: flags.payouts ? 'active' : 'restricted' } } } } },
        requirements: { entries: flags.charges ? [] : [{ awaiting_action_from: 'user' }] },
      });
    if (path === '/v2/core/account_links') return json({ url: 'https://connect.stripe.com/setup/fake' });
    if (path === '/v1/checkout/sessions' && req.method === 'POST') {
      if (acct !== 'acct_fake1') return json({ error: { message: 'falta la cuenta conectada' } }, 400);
      const id = `cs_test_fake_${++sessionSeq}`;
      const metadata: Record<string, string> = {};
      for (const [k, v] of body) if (k.startsWith('metadata[')) metadata[k.slice(9, -1)] = v;
      sessions.set(id, { metadata, paid: false, pi: `pi_fake_${sessionSeq}`, amount: Number(body.get('line_items[0][price_data][unit_amount]')), acct });
      return json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const m = path.match(/^\/v1\/checkout\/sessions\/(.+)$/);
    if (m) {
      const s = sessions.get(m[1]);
      // La sesión solo existe en la cuenta donde se creó.
      if (!s || s.acct !== acct) return json({ error: { code: 'resource_missing', message: 'No such session' } }, 404);
      return json({ id: m[1], payment_status: s.paid ? 'paid' : 'unpaid', amount_total: s.amount, payment_intent: s.pi, metadata: s.metadata });
    }
    if (path === '/v1/refunds') {
      if (acct !== 'acct_fake1') return json({ error: { message: 'falta la cuenta conectada' } }, 400);
      return flags.failRefund ? json({ error: { message: 'boom' } }, 500) : json({ id: 're_fake', status: 'succeeded' });
    }
    return json({ error: { message: `ruta no simulada ${path}` } }, 404);
  },
});

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.STRIPE_API_BASE = `http://localhost:${fake.port}/v1`;
process.env.PLATFORM_FEE_BPS = '0';
invalidatePlans();

const { api } = await import('../src/server/app');
const { db, schema } = await import('../src/server/db');
const { createOrganization } = await import('../src/server/db/organizations');
const { createProduct } = await import('../src/server/db/payments');
const { fulfillCheckout, handleStripeEvent } = await import('../src/server/db/connect');
const { studentPasses } = await import('../src/server/db/payments');
const { listPayments } = await import('../src/server/db/payments');

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-con-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';

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
  const call = async (who: { cookie: string }, method: string, path: string, body?: unknown) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, cookie: who.cookie }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };
  const owner = await mk('owner');
  const staff = await mk('staff');
  const ana = await mk('ana');
  const bea = await mk('bea');

  const org = await createOrganization(owner.id, { name: `ZZ Con ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: staff.id, role: 'staff', createdAt: new Date() });
  const pack = (await createProduct(owner.id, orgId, { name: 'Paquete 8', kind: 'PACKAGE', priceCents: 80000, credits: 8, validityDays: 60 })) as { id: string };
  const cheap = (await createProduct(owner.id, orgId, { name: 'Muestra', kind: 'SINGLE', priceCents: 500 })) as { id: string };
  const urls = { successUrl: 'http://localhost:8081/payment-result?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:8081/membership' };

  // ── Cuenta de la academia ──────────────────────────────────────────────────
  let st = (await call(owner, 'GET', `/orgs/${orgId}/connect`)).json;
  out.push(['Al inicio no hay cuenta conectada', st.available && st.connected === false]);
  const denied = await call(staff, 'POST', `/orgs/${orgId}/connect/onboard`, { returnUrl: 'http://localhost:8081/x', refreshUrl: 'http://localhost:8081/x' });
  out.push(['Quien no es propietario no conecta la cuenta', denied.status === 403, `${denied.status}`]);
  const badUrl = await call(owner, 'POST', `/orgs/${orgId}/connect/onboard`, { returnUrl: 'javascript:alert(1)', refreshUrl: 'http://localhost:8081/x' });
  out.push(['Los enlaces de regreso solo pueden ser http(s) o de la app', badUrl.status === 422, `${badUrl.status}`]);
  const b = { returnUrl: 'http://localhost:8081/payments-setup', refreshUrl: 'http://localhost:8081/payments-setup' };
  const [o1, o2] = await Promise.all([call(owner, 'POST', `/orgs/${orgId}/connect/onboard`, b), call(owner, 'POST', `/orgs/${orgId}/connect/onboard`, b)]);
  out.push(['La propietaria recibe el enlace de Stripe', o1.status === 200 && o1.json.url?.startsWith('https://connect.stripe.com/'), `${o1.status}`]);
  const created = calls.filter((c) => c.path === '/v2/core/accounts' && c.method === 'POST');
  out.push(['Se manda una llave de idempotencia al crear la cuenta', created.every((c) => c.headers.get('idempotency-key') === `connect-account-${orgId}`)]);
  const o3 = await call(owner, 'POST', `/orgs/${orgId}/connect/onboard`, b);
  out.push(['Repetir no crea otra cuenta (se reutiliza la guardada)', calls.filter((c) => c.path === '/v2/core/accounts' && c.method === 'POST').length <= 2 && o3.status === 200 && o2.status === 200]);
  const acct = created[0].json;
  out.push(['La cuenta es de México, con tarjeta y panel completo', acct.identity.country === 'mx' && acct.configuration.merchant.capabilities.card_payments.requested === true && acct.dashboard === 'full']);
  out.push(['Stripe asume las pérdidas y cobra sus comisiones (Managed Risk)', acct.defaults.responsibilities.losses_collector === 'stripe' && acct.defaults.responsibilities.fees_collector === 'stripe']);
  out.push(['Se usa la versión v2 de Stripe', created[0].headers.get('stripe-version') === '2026-09-30.endive']);
  const link = calls.filter((c) => c.path === '/v2/core/account_links').at(-1)!.json;
  out.push(['El enlace de alta lleva los regreso y la cuenta', link.account === 'acct_fake1' && link.use_case.account_onboarding.return_url === b.returnUrl]);

  // ── Cobrar con tarjeta ─────────────────────────────────────────────────────
  const early = await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  out.push(['Sin la cuenta lista no se puede cobrar con tarjeta', early.status === 409, `${early.status}`]);
  let pub = (await call(ana, 'GET', `/discover/orgs/${orgId}/products`)).json;
  out.push(['Los alumnos no ven la opción de tarjeta todavía', pub.acceptsCard === false]);

  flags.charges = true;
  flags.payouts = false;
  st = (await call(owner, 'GET', `/orgs/${orgId}/connect`)).json;
  out.push(['Al terminar el alta el estado se sincroniza con Stripe', st.connected && st.chargesEnabled && !st.payoutsEnabled && st.detailsSubmitted]);
  flags.payouts = true;
  st = (await call(owner, 'GET', `/orgs/${orgId}/connect`)).json;
  out.push(['Cuando Stripe confirma el banco también se refleja', st.payoutsEnabled === true]);
  const dash = await call(owner, 'POST', `/orgs/${orgId}/connect/dashboard`);
  out.push(['La propietaria abre el panel de Stripe', dash.status === 200 && dash.json.url === 'https://dashboard.stripe.com/']);
  const dashDenied = await call(staff, 'POST', `/orgs/${orgId}/connect/dashboard`);
  out.push(['Recepción no abre el panel de cobros', dashDenied.status === 403]);
  pub = (await call(ana, 'GET', `/discover/orgs/${orgId}/products`)).json;
  out.push(['Ahora los alumnos ven la opción de tarjeta', pub.acceptsCard === true]);

  const small = await call(ana, 'POST', `/discover/products/${cheap.id}/card-checkout`, urls);
  out.push(['Montos menores a $10 no van por tarjeta', small.status === 422, `${small.status}`]);
  const evilUrl = await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, { successUrl: 'ftp://x', cancelUrl: urls.cancelUrl });
  out.push(['Un enlace de regreso inválido se rechaza', evilUrl.status === 422]);

  const co = await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  out.push(['La alumna recibe un Checkout', co.status === 200 && co.json.url?.includes('checkout.stripe.com'), `${co.status}`]);
  const sessCall = calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1)!;
  out.push(['Es un cobro directo en la cuenta de la academia', sessCall.headers.get('stripe-account') === 'acct_fake1' && !sessCall.body.has('payment_intent_data[transfer_data][destination]')]);
  out.push(['Al volver se sabe en qué cuenta buscar la sesión', String(sessCall.body.get('success_url')).endsWith('&acct=acct_fake1')]);
  out.push(['Con comisión 0 no se manda comisión', !sessCall.body.has('payment_intent_data[application_fee_amount]')]);
  out.push(['El monto es el del producto en MXN', sessCall.body.get('line_items[0][price_data][unit_amount]') === '80000' && sessCall.body.get('line_items[0][price_data][currency]') === 'mxn']);
  const sid = String(co.json.url).split('/').pop()!;

  process.env.PLATFORM_FEE_BPS = '500';

  invalidatePlans();
  await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  const feeCall = calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1)!;
  out.push(['Con comisión de 5% se retienen $400 de $8,000', feeCall.body.get('payment_intent_data[application_fee_amount]') === '4000', String(feeCall.body.get('payment_intent_data[application_fee_amount]'))]);
  // La comisión depende del plan: plan Business sin comisión aunque la general sea 5%; un plan chico con su propia tasa.
  await db.insert(schema.subscription).values({ id: `${tag}-sub`, plan: 'business', referenceId: orgId, status: 'active', periodEnd: new Date(Date.now() + 30 * 864e5) });
  await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  const bizCall = calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1)!;
  process.env.PLATFORM_FEE_BPS_BUSINESS = '0';
  invalidatePlans();
  await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  const bizZero = calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1)!;
  out.push(['Plan Business con su tasa en 0: no se retiene comisión', !bizZero.body.has('payment_intent_data[application_fee_amount]'), String(bizZero.body.get('payment_intent_data[application_fee_amount]'))]);
  out.push(['Plan Business sin tasa propia usa la general (5%)', bizCall.body.get('payment_intent_data[application_fee_amount]') === '4000']);
  await db.update(schema.subscription).set({ plan: 'pro' }).where(eq(schema.subscription.id, `${tag}-sub`));
  process.env.PLATFORM_FEE_BPS_PRO = '250';
  invalidatePlans();
  await call(ana, 'POST', `/discover/products/${pack.id}/card-checkout`, urls);
  const proCall = calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1)!;
  out.push(['Plan Pro con tasa propia de 2.5%: $200 de $8,000', proCall.body.get('payment_intent_data[application_fee_amount]') === '2000', String(proCall.body.get('payment_intent_data[application_fee_amount]'))]);
  await db.delete(schema.subscription).where(eq(schema.subscription.id, `${tag}-sub`));
  delete process.env.PLATFORM_FEE_BPS_BUSINESS;
  delete process.env.PLATFORM_FEE_BPS_PRO;
  invalidatePlans();
  process.env.PLATFORM_FEE_BPS = '0';
  invalidatePlans();

  // ── Confirmación del pago ──────────────────────────────────────────────────
  const unpaid = await call(ana, 'POST', '/me/checkout/confirm', { sessionId: sid, accountId: 'acct_fake1' });
  out.push(['Un Checkout sin pagar no crea nada', unpaid.json.status === 'unpaid' && (await listPayments(orgId)).length === 0, JSON.stringify(unpaid.json)]);

  sessions.get(sid)!.paid = true;
  const stranger = await call(bea, 'POST', '/me/checkout/confirm', { sessionId: sid, accountId: 'acct_fake1' });
  out.push(['Otra persona no puede confirmar tu pago', stranger.json.status === 'ignored' && (await listPayments(orgId)).length === 0, JSON.stringify(stranger.json)]);
  const wrongAcct = await call(ana, 'POST', '/me/checkout/confirm', { sessionId: sid, accountId: 'acct_otra' });
  out.push(['Una cuenta que no es la de la academia no sirve', wrongAcct.json.status === 'ignored' && (await listPayments(orgId)).length === 0, JSON.stringify(wrongAcct.json)]);
  const badId = await call(ana, 'POST', '/me/checkout/confirm', { sessionId: 'no-es-sesion', accountId: 'acct_fake1' });
  out.push(['Un id que no es de sesión se rechaza', badId.status === 422]);

  // El webhook y la app avisan casi al mismo tiempo (y varias veces).
  await Promise.all([
    call(ana, 'POST', '/me/checkout/confirm', { sessionId: sid, accountId: 'acct_fake1' }),
    call(ana, 'POST', '/me/checkout/confirm', { sessionId: sid, accountId: 'acct_fake1' }),
    handleStripeEvent({ type: 'checkout.session.completed', account: 'acct_fake1', data: { object: { id: sid, metadata: sessions.get(sid)!.metadata } } }),
    fulfillCheckout(sid, 'acct_fake1'),
  ]);
  const pays = await db.select().from(schema.payment).where(eq(schema.payment.organizationId, orgId));
  const passes = await db.select().from(schema.studentPass).where(eq(schema.studentPass.organizationId, orgId));
  out.push(['Avisos repetidos y simultáneos crean un solo pago', pays.length === 1 && pays[0].method === 'CARD' && pays[0].status === 'PAID' && pays[0].amountCents === 80000, `${pays.length}`]);
  out.push(['…y un solo pase de 8 créditos', passes.length === 1 && passes[0].creditsTotal === 8, `${passes.length}`]);
  const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
  out.push(['…y una sola línea de bitácora del cobro', audit.filter((a) => a.action === 'payment.card_received').length === 1]);
  const mine = (await call(ana, 'GET', '/me/membership')).json;
  out.push(['La alumna ve su pase y su pago con tarjeta', mine.passes?.some((p: any) => p.name === 'Paquete 8' && p.remaining === 8) && mine.payments?.some((p: any) => p.method === 'CARD')]);

  // Historial de pagos de la alumna (todas sus academias): paginado, filtrable por academia y solo suyo.
  const hist = (await call(ana, 'GET', '/me/payment-history')).json;
  out.push(['El historial de la alumna trae su pago con academia y moneda', Array.isArray(hist) && hist.length === 1 && hist[0].method === 'CARD' && !!hist[0].organizationName && !!hist[0].currency, `${hist?.length}`]);
  const histOrg = (await call(ana, 'GET', `/me/payment-history?organizationId=${orgId}&limit=1&offset=0`)).json;
  const histOther = (await call(ana, 'GET', '/me/payment-history?organizationId=otra-academia')).json;
  out.push(['El historial se filtra por academia y por páginas', histOrg.length === 1 && histOther.length === 0, `${histOrg.length}/${histOther.length}`]);
  const histStranger = (await call(owner, 'GET', '/me/payment-history')).json;
  out.push(['Cada persona ve solo sus pagos en el historial', Array.isArray(histStranger) && histStranger.length === 0, `${histStranger?.length}`]);

  // Un evento de la plataforma (sin cuenta conectada) o de otra cuenta no registra nada.
  sessions.set('cs_test_fake_forged', { metadata: { ...sessions.get(sid)!.metadata }, paid: true, pi: 'pi_forged', amount: 1, acct: 'acct_atacante' });
  await handleStripeEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_fake_forged', metadata: sessions.get('cs_test_fake_forged')!.metadata } } });
  await handleStripeEvent({ type: 'checkout.session.completed', account: 'acct_atacante', data: { object: { id: 'cs_test_fake_forged', metadata: sessions.get('cs_test_fake_forged')!.metadata } } });
  out.push(['Una sesión de otra cuenta con los datos de esta academia no acredita nada', (await db.select().from(schema.payment).where(eq(schema.payment.organizationId, orgId))).length === 1]);

  // Un aviso que se cayó entre el pago y el pase se completa en el siguiente.
  await db.delete(schema.studentPass).where(eq(schema.studentPass.organizationId, orgId));
  await fulfillCheckout(sid, 'acct_fake1');
  out.push(['Si faltó el pase, el siguiente aviso lo completa', (await db.select().from(schema.studentPass).where(eq(schema.studentPass.organizationId, orgId))).length === 1]);

  // ── Webhook firmado de cuentas conectadas ──────────────────────────────────
  const sign = async (secret: string, body: string, t = Math.floor(Date.now() / 1000)) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${t},v1=${sig}`;
  };
  const hook = async (body: string, header: string | null) => {
    const r = await api.handle(new Request('http://localhost/api/stripe/connect-webhook', { method: 'POST', headers: header ? { 'stripe-signature': header, 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body }));
    return r.status;
  };
  sessions.set('cs_test_fake_w', { metadata: { ...sessions.get(sid)!.metadata }, paid: true, pi: 'pi_fake_w', amount: 80000, acct: 'acct_fake1' });
  const evt = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', account: 'acct_fake1', data: { object: { id: 'cs_test_fake_w', metadata: sessions.get('cs_test_fake_w')!.metadata } } });
  const countCard = async () => (await db.select().from(schema.payment).where(eq(schema.payment.stripeSessionId, 'cs_test_fake_w'))).length;
  out.push(['El webhook rechaza un evento sin firma', (await hook(evt, null)) === 400 && (await countCard()) === 0]);
  out.push(['…con firma de otro secreto', (await hook(evt, await sign('whsec_otro', evt))) === 400 && (await countCard()) === 0]);
  out.push(['…con el cuerpo alterado', (await hook(evt.replace('acct_fake1', 'acct_fake2'), await sign('whsec_fake', evt))) === 400]);
  out.push(['…con una firma vieja (más de 5 minutos)', (await hook(evt, await sign('whsec_fake', evt, Math.floor(Date.now() / 1000) - 3600))) === 400]);
  out.push(['…con una firma mal formada', (await hook(evt, 't=abc,v1=zzz')) === 400]);
  const okHook = await hook(evt, await sign('whsec_fake', evt));
  out.push(['Un evento bien firmado registra el pago', okHook === 200 && (await countCard()) === 1, `${okHook}`]);
  const dup = await Promise.all([hook(evt, await sign('whsec_fake', evt)), hook(evt, await sign('whsec_fake', evt))]);
  out.push(['Reenviarlo (Stripe reintenta) no duplica nada', dup.every((c) => c === 200) && (await countCard()) === 1]);
  const rotated = JSON.stringify({ id: 'evt_2', type: 'charge.refunded', account: 'acct_fake1', data: { object: { payment_intent: 'pi_none', refunded: true } } });
  const rot = `${await sign('whsec_viejo', rotated)},${(await sign('whsec_fake', rotated)).split(',')[1]}`;
  out.push(['Con dos firmas (rotación de secreto) basta que una sea válida', (await hook(rotated, rot)) === 200]);

  // ── Reembolso ──────────────────────────────────────────────────────────────
  const payId = pays[0].id;
  const noPerm = await call(staff, 'POST', `/orgs/${orgId}/payments/${payId}/refund`);
  out.push(['Recepción no puede reembolsar', noPerm.status === 403, `${noPerm.status}`]);
  flags.failRefund = true;
  const fail = await call(owner, 'POST', `/orgs/${orgId}/payments/${payId}/refund`);
  const stillPaid = (await db.query.payment.findFirst({ where: eq(schema.payment.id, payId) }))!;
  out.push(['Si Stripe falla no cambia nada', fail.status === 502 && stillPaid.status === 'PAID']);
  flags.failRefund = false;
  const ok = await call(owner, 'POST', `/orgs/${orgId}/payments/${payId}/refund`);
  const refunded = (await db.query.payment.findFirst({ where: eq(schema.payment.id, payId) }))!;
  const refundCall = calls.filter((c) => c.path === '/v1/refunds').at(-1)!;
  out.push(['La propietaria reembolsa', ok.status === 200 && refunded.status === 'REFUNDED' && !!refunded.refundedAt]);
  out.push(['El reembolso se hace en la cuenta de la academia', refundCall.headers.get('stripe-account') === 'acct_fake1' && refundCall.body.get('payment_intent') === 'pi_fake_1' && !!refundCall.headers.get('idempotency-key')]);
  const refundedPass = (await db.select().from(schema.studentPass).where(eq(schema.studentPass.paymentId, payId)))[0];
  out.push(['El pase del pago reembolsado queda vencido', !!refundedPass?.expiresAt && refundedPass.expiresAt.getTime() <= Date.now(), `${refundedPass?.expiresAt}`]);
  const again = await call(owner, 'POST', `/orgs/${orgId}/payments/${payId}/refund`);
  out.push(['No se reembolsa dos veces', again.status === 409]);
  const cash = await call(owner, 'POST', `/orgs/${orgId}/payments/${crypto.randomUUID()}/refund`);
  out.push(['Un pago inexistente da 404', cash.status === 404]);

  // Reembolso hecho desde el panel de Stripe: el webhook lo refleja.
  sessions.set('cs_test_fake_x', { metadata: { ...sessions.get(sid)!.metadata }, paid: true, pi: 'pi_fake_x', amount: 80000, acct: 'acct_fake1' });
  await fulfillCheckout('cs_test_fake_x', 'acct_fake1');
  await handleStripeEvent({ type: 'charge.refunded', account: 'acct_atacante', data: { object: { payment_intent: 'pi_fake_x', refunded: true } } });
  out.push(['Un reembolso de otra cuenta no marca el pago', (await db.query.payment.findFirst({ where: eq(schema.payment.id, 'stripe_cs_test_fake_x') }))?.status === 'PAID']);
  await handleStripeEvent({ type: 'charge.refunded', account: 'acct_fake1', data: { object: { payment_intent: 'pi_fake_x', refunded: false } } });
  out.push(['Un reembolso parcial desde Stripe no cambia el pago', (await db.query.payment.findFirst({ where: eq(schema.payment.id, 'stripe_cs_test_fake_x') }))?.status === 'PAID']);
  await handleStripeEvent({ type: 'charge.refunded', account: 'acct_fake1', data: { object: { payment_intent: 'pi_fake_x', refunded: true } } });
  out.push(['Un reembolso total desde Stripe marca el pago', (await db.query.payment.findFirst({ where: eq(schema.payment.id, 'stripe_cs_test_fake_x') }))?.status === 'REFUNDED']);

  // Página de regreso de Stripe para celular (Stripe solo admite http/https): reenvía a la app y no es una redirección abierta.
  {
    const get = async (qs: string) => api.handle(new Request(`http://localhost/api/stripe/return?${qs}`));
    const good = await get(`to=${encodeURIComponent('exp://192.168.1.5:8081/--/payment-result')}&session_id=cs_test_abc123&acct=acct_1ABCdef`);
    const html = await good.text();
    out.push(['Regreso de Stripe: abre la app con el pago y la cuenta', good.status === 200 && html.includes('session_id=cs_test_abc123') && html.includes('acct=acct_1ABCdef') && html.includes('exp://192.168.1.5:8081/--/payment-result'), `${good.status}`]);
    const evil = await get(`to=${encodeURIComponent('https://malo.example.com/robar')}`);
    const js = await get(`to=${encodeURIComponent('javascript:alert(1)')}`);
    const inject = await get(`to=${encodeURIComponent('stagelight://x"><script>alert(1)</script>')}`);
    out.push(['Regreso de Stripe: rechaza sitios ajenos, javascript: e inyección', evil.status === 422 && js.status === 422 && inject.status === 422, `${evil.status}/${js.status}/${inject.status}`]);
  }

  for (const [name, ok2, detail] of out) console.log(`${ok2 ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok2]) => !ok2)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (orgId) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
  if (userIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  fake.stop(true);
  process.exit(process.exitCode ?? 0);
}
