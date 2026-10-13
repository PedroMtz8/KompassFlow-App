/**
 * Prueba del traspaso de una academia:
 *  - solo la persona propietaria traspasa y debe confirmar su contraseña;
 *  - la persona elegida debe ser del equipo y tener el correo confirmado;
 *  - al traspasar, la elegida queda como propietaria y quien traspasa como administradora, en una sola operación;
 *  - quien dejó de ser propietaria ya no puede traspasar ni eliminar la academia, y la nueva sí;
 *  - con el traspaso, la propietaria anterior ya puede eliminar su cuenta (antes la bloqueaba ser la única propietaria).
 *   bun --env-file=.env scripts/ownership-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const PASS = 'clave-segura-123';
const tag = `zz-own-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
let orgId = '';

try {
  const mk = async (label: string, verified = true) => {
    const r = await api.handle(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: PASS, name: `ZZ ${label}` }),
      })
    );
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    await db.update(schema.user).set({ emailVerified: verified }).where(eq(schema.user.id, id));
    return { id, cookie };
  };
  const call = async (who: { cookie: string }, method: string, path: string, body?: unknown) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, cookie: who.cookie }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const nuevo = await mk('nuevo');
  const sinCorreo = await mk('sincorreo', false);
  const staff = await mk('staff');
  const org = await createOrganization(owner.id, { name: `ZZ Own ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  const member = async (userId: string, role: string) => {
    const id = crypto.randomUUID();
    await db.insert(schema.member).values({ id, organizationId: orgId, userId, role, createdAt: new Date() });
    return id;
  };
  const nuevoM = await member(nuevo.id, 'admin');
  const sinCorreoM = await member(sinCorreo.id, 'admin');
  const staffM = await member(staff.id, 'staff');
  const ownerM = (await db.query.member.findFirst({ where: eq(schema.member.userId, owner.id) }))!.id;
  const roleOf = async (id: string) => (await db.query.member.findFirst({ where: eq(schema.member.id, id) }))!.role;
  const url = `/orgs/${orgId}/transfer-ownership`;

  const byStaff = await call(staff, 'POST', url, { memberId: staffM, password: PASS });
  out.push(['Quien no es propietaria no puede traspasar', byStaff.status === 403 && (await roleOf(ownerM)) === 'owner', `${byStaff.status}`]);
  const noPass = await call(owner, 'POST', url, { memberId: nuevoM });
  out.push(['Sin contraseña se rechaza', noPass.status === 422 && (await roleOf(nuevoM)) === 'admin', `${noPass.status}`]);
  const badPass = await call(owner, 'POST', url, { memberId: nuevoM, password: 'incorrecta-123' });
  out.push(['Con contraseña incorrecta se rechaza', badPass.status === 403 && (await roleOf(nuevoM)) === 'admin', `${badPass.status}`]);
  const self = await call(owner, 'POST', url, { memberId: ownerM, password: PASS });
  out.push(['No se traspasa a sí misma', self.status === 409]);
  const unverified = await call(owner, 'POST', url, { memberId: sinCorreoM, password: PASS });
  out.push(['No se traspasa a alguien con el correo sin confirmar', unverified.status === 409 && (await roleOf(ownerM)) === 'owner', `${unverified.status}`]);
  const ghost = await call(owner, 'POST', url, { memberId: crypto.randomUUID(), password: PASS });
  out.push(['Un miembro inexistente da 404', ghost.status === 404]);

  // Antes del traspaso, ser la única propietaria bloquea eliminar la cuenta.
  const blocked = await call(owner, 'POST', '/me/delete', { confirm: 'ELIMINAR', password: PASS });
  out.push(['Siendo la única propietaria no puede eliminar su cuenta (y se le dice cómo)', blocked.status === 409 && /Traspásala/.test(blocked.json.message)]);

  const ok = await call(owner, 'POST', url, { memberId: nuevoM, password: PASS });
  out.push(['El traspaso se hace', ok.status === 200, `${ok.status} ${JSON.stringify(ok.json)}`]);
  out.push(['La elegida es propietaria y la anterior administradora', (await roleOf(nuevoM)) === 'owner' && (await roleOf(ownerM)) === 'admin']);
  const owners = await db.select().from(schema.member).where(eq(schema.member.organizationId, orgId));
  out.push(['Queda exactamente una propietaria', owners.filter((m) => m.role === 'owner').length === 1]);
  const audit = (await db.select().from(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId))).find((a) => a.action === 'organization.ownership_transferred');
  out.push(['Queda en la bitácora', !!audit && audit.actorUserId === owner.id]);

  const again = await call(owner, 'POST', url, { memberId: staffM, password: PASS });
  out.push(['Quien dejó de ser propietaria ya no puede traspasar', again.status === 403]);
  const delOld = await call(owner, 'DELETE', `/orgs/${orgId}`, { confirmName: `ZZ Own ${tag}` });
  out.push(['…ni eliminar la academia', delOld.status === 403]);
  const del = await call(owner, 'POST', '/me/delete', { confirm: 'ELIMINAR', password: PASS });
  out.push(['Ahora sí puede eliminar su cuenta', del.status === 200, `${del.status}`]);
  const org2 = await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) });
  out.push(['La academia sigue existiendo con la nueva propietaria', !!org2 && (await roleOf(nuevoM)) === 'owner']);

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
  process.exit(process.exitCode ?? 0);
}
