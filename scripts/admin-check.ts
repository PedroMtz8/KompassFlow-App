/**
 * Prueba del panel de administración de planes y comisiones:
 *  - solo entra quien está en PLATFORM_ADMIN_EMAILS con el correo confirmado (los demás reciben 404: la ruta «no existe»);
 *  - los cambios se validan (comisión máx. 30%, límites enteros, Gratis sin precio) y se reflejan en lo que ven las academias;
 *  - cada cambio deja bitácora; «restablecer» vuelve a los valores por defecto;
 *  - la comisión por plan se aplica al cobro con tarjeta (usa el mismo cálculo que el Checkout).
 *   bun --env-file=.env scripts/admin-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { getPlans } from '../src/server/billing/plan-config';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-adm-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';
process.env.PLATFORM_ADMIN_EMAILS = `${tag}-admin@example.com, otro@nadie.com`;
// Con una base real (--remote) no se pisan los ajustes guardados: se respaldan y se restauran al terminar.
const saved = await db.select().from(schema.planSetting);
await db.delete(schema.planSetting);

try {
  const mk = async (label: string, verified: boolean) => {
    const r = await api.handle(
      new Request('http://localhost/api/auth/sign-up/email', { method: 'POST', headers: H, body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }) })
    );
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    if (verified) await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
    return { id, cookie };
  };
  const call = async (who: { cookie: string } | null, method: string, path: string, body?: unknown) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, ...(who ? { cookie: who.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const admin = await mk('admin', true);
  const unverified = await mk('admin-unverified', false);
  // Mismo correo del administrador pero SIN confirmar: simula a quien se registra con un correo ajeno.
  await db.update(schema.user).set({ email: `${tag}-admin2@example.com` }).where(eq(schema.user.id, unverified.id));
  process.env.PLATFORM_ADMIN_EMAILS += `, ${tag}-admin2@example.com`;
  const regular = await mk('regular', true);
  const org = await createOrganization(admin.id, { name: `ZZ Adm ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  // ── Acceso ─────────────────────────────────────────────────────────────────
  out.push(['Sin sesión no se entra', (await call(null, 'GET', '/admin/plans')).status === 401]);
  out.push(['Una persona normal recibe 404 (la ruta no existe)', (await call(regular, 'GET', '/admin/plans')).status === 404 && (await call(regular, 'PUT', '/admin/plans/pro', { cardFeeBps: 0 })).status === 404]);
  out.push(['Un correo de administrador SIN confirmar no entra', (await call(unverified, 'GET', '/admin/plans')).status === 404]);
  out.push(['/admin/me dice quién es administrador', (await call(admin, 'GET', '/admin/me')).json.admin === true && (await call(regular, 'GET', '/admin/me')).json.admin === false]);

  // ── Lectura y cambios ──────────────────────────────────────────────────────
  const list = await call(admin, 'GET', '/admin/plans');
  const byKey = (j: any[], k: string) => j.find((p) => p.key === k);
  out.push(['El administrador ve los 4 planes', list.status === 200 && list.json.length === 4 && !!byKey(list.json, 'business'), `${list.json?.length}`]);
  out.push(['Gratis no se edita en precio ni prueba', byKey(list.json, 'free').priceEditable === false && (await call(admin, 'PUT', '/admin/plans/free', { priceMxn: 50 })).status === 422]);

  const put = await call(admin, 'PUT', '/admin/plans/pro', { cardFeeBps: 275, maxStudents: 500, maxLocations: null, reports: true, priceMxn: 299, trialDays: 7 });
  const pro = byKey(put.json, 'pro');
  out.push(['Guarda comisión, límites, precio y prueba', put.status === 200 && pro.cardFeeBps === 275 && pro.limits.students === 500 && pro.limits.locations === null && pro.priceMxn === 299 && pro.trialDays === 7, JSON.stringify(pro)]);
  const plans = await getPlans();
  out.push(['El cambio se aplica de inmediato a los planes (límites y comisión)', plans.pro.cardFeeBps === 275 && plans.pro.limits.students === 500 && plans.pro.limits.locations === Infinity]);
  const billing = await call(admin, 'GET', `/orgs/${orgId}/billing`);
  const proSeen = byKey(billing.json.plans, 'pro');
  out.push(['Las academias ven el plan editado', proSeen.cardFeeBps === 275 && proSeen.priceMxn === 299 && proSeen.limits.students === 500, JSON.stringify(proSeen)]);

  // ── Validaciones ───────────────────────────────────────────────────────────
  out.push(['Comisión mayor a 30% se rechaza', (await call(admin, 'PUT', '/admin/plans/pro', { cardFeeBps: 3500 })).status === 422]);
  out.push(['Comisión negativa o decimal se rechaza', (await call(admin, 'PUT', '/admin/plans/pro', { cardFeeBps: -1 })).status === 422 && (await call(admin, 'PUT', '/admin/plans/pro', { cardFeeBps: 2.5 })).status === 422]);
  out.push(['Un límite de 0 se rechaza (usa vacío para ilimitado)', (await call(admin, 'PUT', '/admin/plans/pro', { maxStudents: 0 })).status === 422]);
  out.push(['Precio 0 o enorme se rechaza', (await call(admin, 'PUT', '/admin/plans/pro', { priceMxn: 0 })).status === 422 && (await call(admin, 'PUT', '/admin/plans/pro', { priceMxn: 9_999_999 })).status === 422]);
  out.push(['Un plan que no existe da 404', (await call(admin, 'PUT', '/admin/plans/platino', { cardFeeBps: 0 })).status === 404]);
  out.push(['Lo rechazado no cambió nada', (await getPlans()).pro.cardFeeBps === 275]);

  // ── Bitácora y restablecer ─────────────────────────────────────────────────
  const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.actorUserId, admin.id));
  out.push(['Cada cambio deja bitácora (sin academia)', audit.some((a) => a.action === 'plan.updated' && a.organizationId === null && a.entityId === 'pro')]);
  const reset = await call(admin, 'POST', '/admin/plans/pro/reset');
  const proBack = byKey(reset.json, 'pro');
  out.push(['Restablecer vuelve a los valores por defecto', reset.status === 200 && proBack.limits.students === 400 && proBack.priceMxn === 249 && proBack.trialDays === 14 && proBack.limits.locations === 2, JSON.stringify(proBack)]);

  // ── Resumen, academias y detalle ───────────────────────────────────────────
  out.push(['El resumen es solo para administradores', (await call(regular, 'GET', '/admin/overview')).status === 404 && (await call(null, 'GET', '/admin/overview')).status === 401]);
  const st = await db.insert(schema.student).values({ id: `${tag}-st`, organizationId: orgId, name: 'Alumno ZZ' }).returning({ id: schema.student.id });
  const now = new Date();
  await db.insert(schema.payment).values([
    { id: `${tag}-p1`, organizationId: orgId, studentId: st[0].id, concept: 'Membresía', amountCents: 70000, method: 'CARD', status: 'PAID', feeCents: 1400, cardFunding: 'credit', cardBrand: 'visa', paidAt: now },
    { id: `${tag}-p2`, organizationId: orgId, studentId: st[0].id, concept: 'Pase', amountCents: 6000, method: 'CARD', status: 'PAID', feeCents: 0, cardFunding: 'debit', paidAt: now },
    { id: `${tag}-p3`, organizationId: orgId, studentId: st[0].id, concept: 'Efectivo', amountCents: 9999, method: 'CASH', status: 'PAID', paidAt: now },
  ]);
  const ov = (await call(admin, 'GET', '/admin/overview')).json;
  out.push(['El resumen cuenta academias, alumnos y cobros con tarjeta', ov.orgs.total >= 1 && ov.students >= 1 && ov.card.all.count >= 2 && ov.card.all.volumeCents >= 76000 && ov.card.all.feeCents >= 1400, JSON.stringify(ov.card.all)]);
  out.push(['Separa crédito de débito y no cuenta el efectivo', ov.card.funding.credit?.count >= 1 && ov.card.funding.debit?.count >= 1 && ov.card.all.volumeCents < 76000 + 9999 + 1_000_000, JSON.stringify(ov.card.funding)]);
  out.push(['La comisión del mes aparece en el mes actual', ov.card.feeByMonth.length === 6 && ov.card.feeByMonth.at(-1).feeCents >= 1400, JSON.stringify(ov.card.feeByMonth.at(-1))]);
  out.push(['Las academias no ven crédito/débito en sus pagos', !JSON.stringify((await call(admin, 'GET', `/orgs/${orgId}/payments`)).json).includes('cardFunding') && !JSON.stringify((await call(admin, 'GET', `/orgs/${orgId}/payments/summary`)).json).includes('credit')]);
  const found = (await call(admin, 'GET', `/admin/orgs?q=${encodeURIComponent('zz adm')}`)).json;
  out.push(['Busca academias por nombre y trae al propietario', Array.isArray(found) && found.some((o: any) => o.id === orgId && o.ownerEmail === `${tag}-admin@example.com` && o.students === 1 && o.cardPayments === 2), JSON.stringify(found?.[0])]);
  const byOwner = (await call(admin, 'GET', `/admin/orgs?q=${encodeURIComponent(tag + '-admin')}`)).json;
  out.push(['También busca por correo del propietario', byOwner.some((o: any) => o.id === orgId)]);
  const page = (await call(admin, 'GET', '/admin/orgs?limit=1&offset=0')).json;
  out.push(['El listado de academias es por páginas', page.length === 1]);
  const det = await call(admin, 'GET', `/admin/orgs/${orgId}`);
  out.push(['El detalle trae plan, equipo y cobros', det.status === 200 && det.json.members === 1 && det.json.cardVolumeCents === 76000 && det.json.cardFeeCents === 1400 && det.json.plan === 'free', JSON.stringify(det.json)?.slice(0, 120)]);
  out.push(['Una academia que no existe da 404 y una persona normal también', (await call(admin, 'GET', '/admin/orgs/no-existe')).status === 404 && (await call(regular, 'GET', `/admin/orgs/${orgId}`)).status === 404 && (await call(regular, 'GET', '/admin/orgs')).status === 404]);
  const users = await call(admin, 'GET', `/admin/users?q=${encodeURIComponent(tag)}`);
  const me = users.json?.find((u: any) => u.email === `${tag}-admin@example.com`);
  out.push(['Lista usuarios con sus academias y marca a los administradores', users.status === 200 && !!me && me.isPlatformAdmin === true && me.organizations.some((o: any) => o.id === orgId && o.role === 'owner') && users.json.some((u: any) => u.email === `${tag}-regular@example.com` && !u.isPlatformAdmin), JSON.stringify(me)?.slice(0, 120)]);
  out.push(['La lista de usuarios es por páginas y solo para administradores', (await call(admin, 'GET', '/admin/users?limit=1')).json.length === 1 && (await call(regular, 'GET', '/admin/users')).status === 404 && (await call(null, 'GET', '/admin/users')).status === 401]);
  // ── Suspensión de cuentas y bitácora ───────────────────────────────────────
  const victim = await mk('victim', true);
  const signIn = async () => (await api.handle(new Request('http://localhost/api/auth/sign-in/email', { method: 'POST', headers: H, body: JSON.stringify({ email: `${tag}-victim@example.com`, password: 'clave-segura-123' }) }))).status;
  out.push(['Antes de suspenderla la cuenta entra normal', (await call(victim, 'GET', '/me/security')).status === 200 && (await signIn()) === 200]);
  out.push(['Solo administradores suspenden', (await call(regular, 'POST', `/admin/users/${victim.id}/suspend`, { reason: 'abuso de la plataforma' })).status === 404]);
  out.push(['Exige un motivo', (await call(admin, 'POST', `/admin/users/${victim.id}/suspend`, { reason: 'x' })).status === 422]);
  out.push(['No se suspende a un administrador ni a uno mismo', (await call(admin, 'POST', `/admin/users/${admin.id}/suspend`, { reason: 'prueba de auto-suspensión' })).status === 409]);
  const sus = await call(admin, 'POST', `/admin/users/${victim.id}/suspend`, { reason: 'Reservas falsas reportadas' });
  out.push(['Suspender cierra sus sesiones y queda marcado', sus.status === 200 && sus.json.suspension.reason === 'Reservas falsas reportadas' && sus.json.openSessions === 0, JSON.stringify(sus.json?.suspension)]);
  out.push(['Con la sesión vieja ya no entra', [401, 403].includes((await call(victim, 'GET', '/me/security')).status)]);
  out.push(['Tampoco puede volver a iniciar sesión', (await signIn()) === 403]);
  const flagged = (await call(admin, 'GET', `/admin/users?q=${encodeURIComponent(tag + '-victim')}`)).json;
  out.push(['La lista de usuarios la marca como suspendida', flagged[0]?.suspended === true]);
  const react = await call(admin, 'POST', `/admin/users/${victim.id}/reactivate`);
  out.push(['Reactivar le devuelve el acceso', react.status === 200 && react.json.suspension === null && (await signIn()) === 200 && (await call(admin, 'POST', `/admin/users/${victim.id}/reactivate`)).status === 404]);
  const aud = (await call(admin, 'GET', '/admin/audit?prefix=user.&limit=50')).json;
  out.push(['La bitácora de administración muestra quién y qué', aud.some((a: any) => a.action === 'user.suspended' && a.actorEmail === `${tag}-admin@example.com` && a.entityId === victim.id) && aud.some((a: any) => a.action === 'user.reactivated') && aud.every((a: any) => a.action.startsWith('user.'))]);
  out.push(['La bitácora es solo para administradores', (await call(regular, 'GET', '/admin/audit')).status === 404]);
  out.push(['El detalle de usuario trae academias y actividad', (await call(admin, 'GET', `/admin/users/${admin.id}`)).json.organizations.some((o: any) => o.id === orgId) && (await call(regular, 'GET', `/admin/users/${admin.id}`)).status === 404 && (await call(admin, 'GET', '/admin/users/no-existe')).status === 404]);
  out.push(['El relleno de tarjeta es solo para administradores', (await call(regular, 'POST', '/admin/card-info/backfill')).status === 404]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  await db.delete(schema.planSetting);
  if (saved.length) await db.insert(schema.planSetting).values(saved);
  if (orgId) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
  if (userIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  process.exit(process.exitCode ?? 0);
}
