/**
 * Prueba de privacidad del equipo y permisos adicionales por persona:
 *  - quien no tiene `member:read_contact` no ve los correos del equipo ni las invitaciones pendientes;
 *  - a una persona se le pueden dar permisos adicionales sobre su rol (solo para ella) o crear con ellos un rol reutilizable;
 *  - nadie da permisos que no tiene, ni a sí mismo, ni al propietario; cambiar el rol quita los adicionales.
 *   bun --env-file=.env scripts/extras-check.ts
 */
import { and, eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { teachingUserIds } from '../src/server/auth/access';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const tag = `zz-ext-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  api.handle(new Request(`http://localhost/api${path}`, { method, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
const status = async (p: Promise<Response>) => (await p).status;

async function signUp(label: string) {
  const r = await call('POST', '/auth/sign-up/email', undefined, { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` });
  const id = ((await r.json()) as { user: { id: string } }).user.id;
  ids.push(id);
  return { id, cookie: cookieOf(r), email: `${tag}-${label}@example.com` };
}
const addMember = async (userId: string, role: string) => {
  const id = crypto.randomUUID();
  await db.insert(schema.member).values({ id, organizationId: orgId, userId, role, createdAt: new Date() });
  return id;
};
const memberRole = async (userId: string) =>
  (await db.query.member.findFirst({ where: and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)) }))!.role;
const extras = (memberId: string, cookie: string, permissions: Record<string, string[]>, template?: { name: string }) =>
  call('PUT', `/orgs/${orgId}/members/${memberId}/extra-permissions`, cookie, { permissions, template });

try {
  const owner = await signUp('owner');
  const admin = await signUp('admin');
  const insA = await signUp('insa');
  const insB = await signUp('insb');
  const staff = await signUp('staff');
  const other = await signUp('other');
  const org = await createOrganization(owner.id, { name: `ZZ Ext ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await addMember(admin.id, 'admin');
  const mA = await addMember(insA.id, 'instructor');
  const mB = await addMember(insB.id, 'instructor');
  const mS = await addMember(staff.id, 'staff');
  const mO = (await db.query.member.findFirst({ where: and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, owner.id)) }))!.id;
  const mAdmin = (await db.query.member.findFirst({ where: and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, admin.id)) }))!.id;

  // ── Privacidad del equipo ───────────────────────────────────────────────────
  await call('POST', `/orgs/${orgId}/invitations`, owner.cookie, { email: `${tag}-invitada@example.com`, role: 'staff' });
  type Team = { members: { email: string | null; name: string }[]; invitations: unknown[] };
  const team = async (c: string) => (await (await call('GET', `/orgs/${orgId}/team`, c)).json()) as Team;
  const tOwner = await team(owner.cookie);
  const tAdmin = await team(admin.cookie);
  const tIns = await team(insA.cookie);
  const tStaff = await team(staff.cookie);
  out.push(['El propietario ve los correos y las invitaciones', tOwner.members.every((m) => !!m.email) && tOwner.invitations.length === 1]);
  out.push(['El administrador también', tAdmin.members.every((m) => !!m.email) && tAdmin.invitations.length === 1]);
  out.push(['Un instructor ve a las personas pero no sus correos', tIns.members.length === 6 - 1 && tIns.members.every((m) => m.email === null && !!m.name)]);
  out.push(['Y no ve invitaciones pendientes (son correos ajenos)', tIns.invitations.length === 0]);
  out.push(['Recepción tampoco ve correos del equipo', tStaff.members.every((m) => m.email === null)]);
  out.push(['Quien no es del equipo recibe 404', (await status(call('GET', `/orgs/${orgId}/team`, other.cookie))) === 404]);

  // ── Permisos adicionales ────────────────────────────────────────────────────
  const sessionId = crypto.randomUUID();
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  await db.insert(schema.classSession).values({ id: sessionId, organizationId: orgId, serviceId: svc, instructorUserId: insB.id, startsAt: new Date(Date.now() + 10 * 60_000), endsAt: new Date(Date.now() + 70 * 60_000), capacity: 5, status: 'SCHEDULED' });
  const stId = crypto.randomUUID();
  await db.insert(schema.student).values({ id: stId, organizationId: orgId, name: 'Alumno' });
  const bId = crypto.randomUUID();
  await db.insert(schema.booking).values({ id: bId, organizationId: orgId, sessionId, studentId: stId, status: 'CONFIRMED', source: 'STAFF' });
  const mark = (c: string) => call('PUT', `/orgs/${orgId}/sessions/${sessionId}/attendance/${bId}`, c, { status: 'PRESENT' });

  out.push(['Sin extras, el instructor A no pasa lista en la clase de B', (await status(mark(insA.cookie))) === 403]);
  const g = await extras(mA, owner.cookie, { attendance: ['read', 'update', 'update_any'] });
  out.push(['El propietario le da «pasar lista a otros» a esa persona', g.ok]);
  const row = await db.query.memberExtraPermission.findFirst({ where: eq(schema.memberExtraPermission.memberId, mA) });
  out.push(['Se guarda solo lo adicional (no lo que su rol ya da)', JSON.stringify(JSON.parse(row!.permission)) === JSON.stringify({ attendance: ['update_any'] }), row?.permission]);
  out.push(['Su rol sigue siendo instructor', (await memberRole(insA.id)) === 'instructor']);
  out.push(['Ahora sí pasa lista en la clase de B', (await mark(insA.cookie)).ok]);
  out.push(['El instructor B no ganó nada', (await status(call('POST', `/orgs/${orgId}/sessions/${sessionId}/attendance/reopen`, insB.cookie))) === 200]);
  const orgsA = (await (await call('GET', '/orgs', insA.cookie)).json()) as { permissions: Record<string, string[]> }[];
  out.push(['Sus permisos efectivos (rol + extras) llegan a la app', !!orgsA[0].permissions.attendance?.includes('update_any') && !!orgsA[0].permissions.session?.includes('teach')]);
  const teamAfter = (await (await call('GET', `/orgs/${orgId}/team`, owner.cookie)).json()) as { members: { id: string; extraPermissions: unknown }[] };
  out.push(['El equipo muestra sus permisos adicionales a quien administra', !!teamAfter.members.find((m) => m.id === mA)?.extraPermissions && teamAfter.members.find((m) => m.id === mB)?.extraPermissions === null]);

  // Extras de «impartir» cuentan como instructor asignable.
  out.push(['Recepción no imparte', !(await teachingUserIds(orgId)).includes(staff.id)]);
  await extras(mS, owner.cookie, { session: ['teach'] });
  out.push(['Con «impartir» como extra, recepción ya puede dar clases', (await teachingUserIds(orgId)).includes(staff.id)]);

  // ── Límites ─────────────────────────────────────────────────────────────────
  out.push(['Un administrador no da permisos que no tiene (plan)', (await status(extras(mB, admin.cookie, { plan: ['manage'] }))) === 403]);
  out.push(['Nadie se los da a sí mismo', (await status(extras(mAdmin, admin.cookie, { cash: ['read'] }))) === 403]);
  out.push(['No se toca al propietario', (await status(extras(mO, admin.cookie, { cash: ['read'] }))) === 403]);
  out.push(['Un administrador no cambia a otro administrador', (await status(extras(mAdmin, owner.cookie, { cash: ['read'] }))) === 200 && (await status(extras(mAdmin, admin.cookie, { cash: ['read'] }))) === 403]);
  out.push(['Un instructor no puede dar permisos', (await status(extras(mB, insB.cookie, { cash: ['read'] }))) === 403]);
  out.push(['Un recurso inventado se descarta (vacío = quitar)', (await status(extras(mB, owner.cookie, { cohetes: ['volar'] }))) === 200 && !(await db.query.memberExtraPermission.findFirst({ where: eq(schema.memberExtraPermission.memberId, mB) }))]);

  // ── Quitar y cambiar de rol ─────────────────────────────────────────────────
  await extras(mA, owner.cookie, {});
  out.push(['Quitar los adicionales devuelve el comportamiento del rol', (await status(mark(insA.cookie))) === 403]);
  await extras(mA, owner.cookie, { attendance: ['update_any'] });
  const ch = await call('PATCH', `/orgs/${orgId}/members/${mA}`, owner.cookie, { role: 'staff' });
  const left = await db.query.memberExtraPermission.findFirst({ where: eq(schema.memberExtraPermission.memberId, mA) });
  out.push(['Cambiar el rol borra los adicionales', ch.ok && !left]);
  await call('PATCH', `/orgs/${orgId}/members/${mA}`, owner.cookie, { role: 'instructor' });

  // ── Guardar como rol reutilizable ───────────────────────────────────────────
  const tpl = await extras(mA, owner.cookie, { attendance: ['update_any'], report: ['read'] }, { name: 'Instructor + asistencia total' });
  const tplJson = (await tpl.json()) as { role?: string; template?: boolean };
  out.push(['Crea el rol reutilizable y se lo asigna', tpl.ok && tplJson.role === 'instructor + asistencia total' && (await memberRole(insA.id)) === 'instructor + asistencia total']);
  const roles = (await (await call('GET', `/orgs/${orgId}/roles`, owner.cookie)).json()) as { roles: { id: string; permissions: Record<string, string[]>; members: number }[] };
  const r = roles.roles.find((x) => x.id === 'instructor + asistencia total');
  out.push(['El rol es una copia del instructor más lo adicional', !!r && !!r.permissions.session?.includes('teach') && !!r.permissions.attendance?.includes('update_any') && !!r.permissions.report?.includes('read') && r.members === 1]);
  out.push(['Se vuelve a usar para otra persona', (await call('PATCH', `/orgs/${orgId}/members/${mB}`, owner.cookie, { role: 'instructor + asistencia total' })).ok && (await mark(insB.cookie)).ok]);
  out.push(['Los adicionales ya no quedan sueltos en quien lo recibió', !(await db.query.memberExtraPermission.findFirst({ where: eq(schema.memberExtraPermission.memberId, mA) }))]);
  out.push(['Un nombre del sistema se rechaza como plantilla', (await status(extras(mS, owner.cookie, { report: ['read'] }, { name: 'Administrador' }))) === 409]);
  out.push(['Sin permisos adicionales no se crea plantilla', (await status(extras(mS, owner.cookie, {}, { name: 'Vacio total' }))) === 422]);

  // ── Contacto de alumnos ─────────────────────────────────────────────────────
  const cid = crypto.randomUUID();
  await db.insert(schema.student).values({ id: cid, organizationId: orgId, name: 'Contacto Prueba', phone: '3115550000', email: `${tag}-alumno@example.com` });
  const cbook = crypto.randomUUID();
  await db.insert(schema.booking).values({ id: cbook, organizationId: orgId, sessionId, studentId: cid, status: 'CONFIRMED', source: 'STAFF' });
  type S = { id: string; phone: string | null; email: string | null }[];
  const list = async (c: string, q = '') => (await (await call('GET', `/orgs/${orgId}/students${q}`, c)).json()) as S;
  const mine = (l: S) => l.find((s) => s.id === cid);
  const lOwner = await list(owner.cookie);
  const lStaff = await list(staff.cookie);
  const lIns = await list(insB.cookie);
  out.push(['Propietario y recepción ven teléfono y correo del alumno', mine(lOwner)?.phone === '3115550000' && !!mine(lStaff)?.email]);
  out.push(['Un instructor ve al alumno pero sin teléfono ni correo', !!mine(lIns) && mine(lIns)?.phone === null && mine(lIns)?.email === null]);
  out.push(['Un instructor no puede buscar por teléfono ni por correo', (await list(insB.cookie, '?q=3115550000')).length === 0 && (await list(insB.cookie, `?q=${tag}-alumno`)).length === 0]);
  out.push(['Pero sí por nombre', !!mine(await list(insB.cookie, '?q=Contacto'))]);
  const dIns = (await (await call('GET', `/orgs/${orgId}/students/${cid}`, insB.cookie)).json()) as { phone: string | null; email: string | null };
  const dOwner = (await (await call('GET', `/orgs/${orgId}/students/${cid}`, owner.cookie)).json()) as { phone: string | null };
  out.push(['El detalle del alumno también lo oculta al instructor', dIns.phone === null && dIns.email === null && dOwner.phone === '3115550000']);
  const rIns = (await (await call('GET', `/orgs/${orgId}/sessions/${sessionId}/roster`, insB.cookie)).json()) as { studentId: string; phone: string | null }[];
  out.push(['Y la lista de reservas de la clase', rIns.find((r) => r.studentId === cid)?.phone === null]);
  const aIns = (await (await call('GET', `/orgs/${orgId}/sessions/${sessionId}/attendance`, insB.cookie)).json()) as { students: { studentId: string; phone: string | null }[] };
  const aOwner = (await (await call('GET', `/orgs/${orgId}/sessions/${sessionId}/attendance`, owner.cookie)).json()) as { students: { studentId: string; phone: string | null }[] };
  out.push(['Y el pase de lista (el propietario sí lo ve)', aIns.students.find((r) => r.studentId === cid)?.phone === null && aOwner.students.find((r) => r.studentId === cid)?.phone === '3115550000']);
  await extras(mB, owner.cookie, { student: ['read_contact'] });
  out.push(['Con el permiso como extra, el instructor ya ve el contacto', mine(await list(insB.cookie))?.phone === '3115550000']);

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
  if (ids.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }
  process.exit(process.exitCode ?? 0);
}
