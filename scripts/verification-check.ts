/**
 * Prueba del flujo de verificación antes de publicar y del plan otorgado a mano:
 *  - una organización nace oculta y no puede publicarse por su cuenta;
 *  - para pedir la revisión debe cumplir los requisitos (perfil, sede con espacio, clase, producto con precio, contacto);
 *  - la solicitud queda en revisión; solo la plataforma la aprueba (publica) o la rechaza/suspende (oculta, con motivo);
 *  - el motivo lo ve la organización y la nota interna no; todo deja bitácora y avisos;
 *  - el administrador puede otorgar un plan con o sin vencimiento y quitarlo.
 *   bun --env-file=.env scripts/verification-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { activeOverride } from '../src/server/db/billing';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-ver-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';
process.env.PLATFORM_ADMIN_EMAILS = `${tag}-admin@example.com`;

try {
  const mk = async (label: string, verified = true) => {
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
  const detailRow = () => db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, orgId) });

  const admin = await mk('admin');
  const owner = await mk('owner');
  const stranger = await mk('stranger');
  const org = await createOrganization(owner.id, { name: `ZZ Ver ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  // ── Nace oculta ────────────────────────────────────────────────────────────
  let d = await detailRow();
  out.push(['Una organización nueva nace oculta y sin verificar', d?.isPublished === false && d.verificationStatus === 'NONE']);
  out.push(['No puede publicarse por su cuenta', (await call(owner, 'PATCH', `/orgs/${orgId}`, { isPublished: true })).status === 409 && (await detailRow())?.isPublished === false]);
  out.push(['No aparece en Descubrir', (await call(stranger, 'GET', `/discover/orgs/${orgId}`)).status === 404]);

  // ── Requisitos ─────────────────────────────────────────────────────────────
  const v0 = await call(owner, 'GET', `/orgs/${orgId}/verification`);
  const missing = (v0.json.checklist as any[]).filter((c) => !c.ok).map((c) => c.key).sort();
  out.push(['Muestra qué falta (la sede con espacio ya está)', v0.status === 200 && JSON.stringify(missing) === JSON.stringify(['contact', 'cover', 'description', 'logo', 'product', 'service']) && v0.json.canRequest === false, missing.join(',')]);
  const early = await call(owner, 'POST', `/orgs/${orgId}/verification`, {});
  out.push(['No se puede pedir la revisión con requisitos pendientes', early.status === 422 && (await detailRow())?.verificationStatus === 'NONE', early.json?.message]);
  out.push(['Quien no es de la organización recibe 404', (await call(stranger, 'GET', `/orgs/${orgId}/verification`)).status === 404 && (await call(stranger, 'POST', `/orgs/${orgId}/verification`, {})).status === 404]);

  // Un producto gratis, una clase inactiva o una descripción corta no cuentan.
  await db.update(schema.organization).set({ logo: 'https://x/logo.png' }).where(eq(schema.organization.id, orgId));
  await db.update(schema.organizationDetail).set({ coverImage: 'https://x/c.png', description: 'corta', phone: '3111234567' }).where(eq(schema.organizationDetail.organizationId, orgId));
  await db.insert(schema.service).values({ id: `${tag}-s0`, organizationId: orgId, name: 'Inactiva', durationMin: 60, isActive: false });
  await db.insert(schema.product).values({ id: `${tag}-p0`, organizationId: orgId, name: 'Gratis', kind: 'SINGLE', priceCents: 0 });
  const v1 = await call(owner, 'GET', `/orgs/${orgId}/verification`);
  const still = (v1.json.checklist as any[]).filter((c) => !c.ok).map((c) => c.key).sort();
  out.push(['Descripción corta, clase inactiva y producto sin precio no cuentan', JSON.stringify(still) === JSON.stringify(['description', 'product', 'service']), still.join(',')]);

  await db.update(schema.organizationDetail).set({ description: 'Academia de baile para todos los niveles en el centro.' }).where(eq(schema.organizationDetail.organizationId, orgId));
  await db.insert(schema.service).values({ id: `${tag}-s1`, organizationId: orgId, name: 'Bachata', durationMin: 60 });
  await db.insert(schema.product).values({ id: `${tag}-p1`, organizationId: orgId, name: 'Clase suelta', kind: 'SINGLE', priceCents: 15000 });
  const v2 = await call(owner, 'GET', `/orgs/${orgId}/verification`);
  out.push(['Con todo completo puede pedir la revisión', v2.json.complete === true && v2.json.canRequest === true]);

  // ── Solicitud ──────────────────────────────────────────────────────────────
  const req = await call(owner, 'POST', `/orgs/${orgId}/verification`, { message: 'Mi Instagram es @zzver' });
  d = await detailRow();
  out.push(['La solicitud queda en revisión y sigue oculta', req.status === 200 && d?.verificationStatus === 'PENDING' && d.isPublished === false && d.verificationMessage === 'Mi Instagram es @zzver' && !!d.verificationRequestedAt]);
  out.push(['No se puede pedir dos veces', (await call(owner, 'POST', `/orgs/${orgId}/verification`, {})).status === 409]);
  out.push(['En revisión tampoco puede publicarse', (await call(owner, 'PATCH', `/orgs/${orgId}`, { isPublished: true })).status === 409]);
  out.push(['Se avisa a la plataforma', (await db.select().from(schema.notification).where(eq(schema.notification.userId, admin.id))).some((n) => n.title.includes('solicitud') && n.url?.includes(orgId))]);

  // ── Administración ─────────────────────────────────────────────────────────
  out.push(['Solo administradores ven las solicitudes', (await call(owner, 'GET', '/admin/verifications?status=PENDING')).status === 404 && (await call(null, 'GET', '/admin/verifications?status=PENDING')).status === 401 && (await call(owner, 'GET', `/admin/verifications/${orgId}`)).status === 404]);
  const list = await call(admin, 'GET', '/admin/verifications?status=PENDING');
  out.push(['La solicitud aparece en pendientes con su propietario', list.status === 200 && list.json.some((x: any) => x.id === orgId && x.ownerEmail === `${tag}-owner@example.com`)]);
  const counts = await call(admin, 'GET', '/admin/verifications/counts');
  const ov = await call(admin, 'GET', '/admin/overview');
  out.push(['Los conteos y el resumen traen los pendientes', counts.json.pending >= 1 && ov.json.verifications.pending >= 1]);
  const det = await call(admin, 'GET', `/admin/verifications/${orgId}`);
  out.push(['El detalle trae lo necesario para comprobar que existe', det.status === 200 && det.json.phone === '3111234567' && det.json.owner.email === `${tag}-owner@example.com` && det.json.locations[0].address === 'Calle 1' && det.json.products.length === 2 && det.json.message === 'Mi Instagram es @zzver' && det.json.checklist.length === 7]);

  out.push(['Un método de verificación inválido se rechaza', (await call(admin, 'POST', `/admin/verifications/${orgId}/approve`, { method: 'MAGIA' })).status === 422]);
  out.push(['Rechazar exige un motivo', (await call(admin, 'POST', `/admin/verifications/${orgId}/reject`, { reason: '' })).status === 422 && (await detailRow())?.verificationStatus === 'PENDING']);
  const ap = await call(admin, 'POST', `/admin/verifications/${orgId}/approve`, { method: 'PHONE', note: 'Llamé y contestó el dueño' });
  d = await detailRow();
  out.push(['Aprobar publica y registra cómo se verificó', ap.status === 200 && d?.verificationStatus === 'APPROVED' && d.isPublished === true && d.verificationMethod === 'PHONE' && d.verificationReviewedBy === admin.id]);
  out.push(['Ya aparece en Descubrir', (await call(stranger, 'GET', `/discover/orgs/${orgId}`)).status === 200]);
  out.push(['Se avisa al dueño', (await db.select().from(schema.notification).where(eq(schema.notification.userId, owner.id))).some((n) => n.title.includes('Descubrir'))]);
  out.push(['No se aprueba dos veces', (await call(admin, 'POST', `/admin/verifications/${orgId}/approve`, { method: 'PHONE' })).status === 409]);

  // Verificada: el dueño ya puede ocultarla y mostrarla cuando quiera.
  out.push(['Verificada, el dueño la oculta y la vuelve a mostrar', (await call(owner, 'PATCH', `/orgs/${orgId}`, { isPublished: false })).status === 200 && (await detailRow())?.isPublished === false && (await call(owner, 'PATCH', `/orgs/${orgId}`, { isPublished: true })).status === 200 && (await detailRow())?.isPublished === true]);

  // ── Rechazo / suspensión ───────────────────────────────────────────────────
  const rej = await call(admin, 'POST', `/admin/verifications/${orgId}/reject`, { reason: 'No pudimos comunicarnos al teléfono', note: 'Sospechoso' });
  d = await detailRow();
  out.push(['Rechazar (o suspender) oculta y guarda el motivo', rej.status === 200 && d?.verificationStatus === 'REJECTED' && d.isPublished === false && (await call(stranger, 'GET', `/discover/orgs/${orgId}`)).status === 404]);
  const seen = await call(owner, 'GET', `/orgs/${orgId}/verification`);
  out.push(['El dueño ve el motivo pero no la nota interna', seen.json.reason === 'No pudimos comunicarnos al teléfono' && !JSON.stringify(seen.json).includes('Sospechoso') && !JSON.stringify((await call(owner, 'GET', `/orgs/${orgId}`)).json).includes('Sospechoso')]);
  out.push(['Rechazada no puede publicarse sola', (await call(owner, 'PATCH', `/orgs/${orgId}`, { isPublished: true })).status === 409]);
  out.push(['Puede corregir y volver a pedirla (limpia el motivo)', (await call(owner, 'POST', `/orgs/${orgId}/verification`, {})).status === 200 && (await detailRow())?.verificationStatus === 'PENDING' && (await detailRow())?.verificationReason === null]);
  out.push(['Se puede rechazar una solicitud pendiente', (await call(admin, 'POST', `/admin/verifications/${orgId}/reject`, { reason: 'Datos incompletos' })).status === 200]);
  out.push(['Rechazada no se rechaza otra vez', (await call(admin, 'POST', `/admin/verifications/${orgId}/reject`, { reason: 'Otra vez' })).status === 409]);
  const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
  const acts = audit.map((a) => a.action);
  out.push(['Todo deja bitácora', ['organization.verification_requested', 'organization.verification_approved', 'organization.verification_rejected'].every((a) => acts.includes(a))]);

  // ── Plan otorgado a mano ───────────────────────────────────────────────────
  out.push(['Solo administradores otorgan planes', (await call(owner, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'pro', days: 30 })).status === 404 && (await call(owner, 'DELETE', `/admin/orgs/${orgId}/plan`)).status === 404]);
  out.push(['Plan inexistente, días 0 o enormes se rechazan', (await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'platino', days: 30 })).status === 404 && (await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'pro', days: 0 })).status === 422 && (await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'pro', days: 5000 })).status === 422]);
  const g = await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'pro', days: 30, note: 'Cortesía de lanzamiento' });
  out.push(['Otorga Pro por 30 días y lo muestra en el detalle', g.status === 200 && g.json.planGrant.plan === 'pro' && g.json.plan === 'pro' && g.json.planStatus === 'granted' && Math.abs(new Date(g.json.planGrant.expiresAt).getTime() - (Date.now() + 30 * 864e5)) < 60_000]);
  out.push(['El plan otorgado manda en el cálculo de la academia', (await activeOverride(orgId))?.plan === 'pro']);
  out.push(['Se puede cambiar a otro sin vencimiento', (await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'business', days: null })).json.planGrant.expiresAt === null]);
  await db.update(schema.planOverride).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.planOverride.organizationId, orgId));
  const exp = await call(admin, 'GET', `/admin/orgs/${orgId}`);
  out.push(['Vencido deja de aplicar', (await activeOverride(orgId)) === null && exp.json.planGrant === null && exp.json.plan === 'free']);
  await call(admin, 'PUT', `/admin/orgs/${orgId}/plan`, { plan: 'starter', days: 7 });
  const rv = await call(admin, 'DELETE', `/admin/orgs/${orgId}/plan`);
  out.push(['Quitarlo regresa al plan real', rv.status === 200 && rv.json.planGrant === null && rv.json.plan === 'free' && (await call(admin, 'DELETE', `/admin/orgs/${orgId}/plan`)).status === 404]);
  out.push(['Quedó en bitácora', (await db.select().from(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId))).filter((a) => a.action.startsWith('plan.')).length >= 4]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
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
    await db.delete(schema.notification).where(inArray(schema.notification.userId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  process.exit(process.exitCode ?? 0);
}
