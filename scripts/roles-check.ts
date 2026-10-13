/**
 * Prueba de roles y permisos:
 *  - un instructor solo pasa lista (marcar, cerrar, reabrir) en las clases que imparte; ver la lista sí puede;
 *  - recepción/admin/propietario en cualquier clase, y un rol personalizado con `update_any` también;
 *  - la academia crea, edita y borra roles a su medida (máx. 20) sin poder dar permisos que no tiene;
 *  - los nombres de los roles del sistema están reservados y un rol en uso no se borra.
 *   bun --env-file=.env scripts/roles-check.ts
 */
import { and, eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { rolesWith } from '../src/server/auth/access';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const tag = `zz-rol-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  api.handle(new Request(`http://localhost/api${path}`, { method, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));

async function signUp(label: string) {
  const r = await call('POST', '/auth/sign-up/email', undefined, { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` });
  const id = ((await r.json()) as { user: { id: string } }).user.id;
  ids.push(id);
  return { id, cookie: cookieOf(r) };
}
const addMember = (userId: string, role: string) =>
  db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId, role, createdAt: new Date() });
const setRole = (userId: string, role: string) =>
  db.update(schema.member).set({ role }).where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)));
const status = async (p: Promise<Response>) => (await p).status;

try {
  const owner = await signUp('owner');
  const admin = await signUp('admin');
  const insA = await signUp('insa');
  const insB = await signUp('insb');
  const staff = await signUp('staff');
  const custom = await signUp('custom');
  const outsider = await signUp('outsider');
  const org = await createOrganization(owner.id, { name: `ZZ Rol ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await addMember(admin.id, 'admin');
  await addMember(insA.id, 'instructor');
  await addMember(insB.id, 'instructor');
  await addMember(staff.id, 'staff');
  await addMember(custom.id, 'instructor');

  // Dos clases (una de cada instructor) a punto de empezar, cada una con una reserva.
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const mkSession = async (instructor: string) => {
    const sid = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id: sid, organizationId: orgId, serviceId: svc, instructorUserId: instructor,
      startsAt: new Date(Date.now() + 10 * 60_000), endsAt: new Date(Date.now() + 70 * 60_000), capacity: 5, status: 'SCHEDULED',
    });
    const stId = crypto.randomUUID();
    await db.insert(schema.student).values({ id: stId, organizationId: orgId, name: `Alumno ${instructor.slice(0, 4)}` });
    const bid = crypto.randomUUID();
    await db.insert(schema.booking).values({ id: bid, organizationId: orgId, sessionId: sid, studentId: stId, status: 'CONFIRMED', source: 'STAFF' });
    return { sid, bid };
  };
  const sA = await mkSession(insA.id);
  const sB = await mkSession(insB.id);
  const mark = (c: string, s: { sid: string; bid: string }) =>
    call('PUT', `/orgs/${orgId}/sessions/${s.sid}/attendance/${s.bid}`, c, { status: 'PRESENT' });

  // ── Instructor: solo lo suyo ───────────────────────────────────────────────
  out.push(['El instructor pasa lista en su clase', (await mark(insA.cookie, sA)).ok]);
  out.push(['El instructor NO pasa lista en la clase de otro', (await status(mark(insA.cookie, sB))) === 403]);
  out.push(['Tampoco cierra la lista ajena', (await status(call('POST', `/orgs/${orgId}/sessions/${sB.sid}/attendance/close`, insA.cookie))) === 403]);
  out.push(['Tampoco la reabre', (await status(call('POST', `/orgs/${orgId}/sessions/${sB.sid}/attendance/reopen`, insA.cookie))) === 403]);
  const viewB = (await (await call('GET', `/orgs/${orgId}/sessions/${sB.sid}/attendance`, insA.cookie)).json()) as { canMark: boolean; teacherName: string | null };
  const viewA = (await (await call('GET', `/orgs/${orgId}/sessions/${sA.sid}/attendance`, insA.cookie)).json()) as { canMark: boolean };
  out.push(['Puede VER la lista ajena, marcada como solo lectura', viewB.canMark === false && !!viewB.teacherName]);
  out.push(['En la propia puede marcar', viewA.canMark === true]);

  // ── Quien tiene update_any ─────────────────────────────────────────────────
  out.push(['Recepción pasa lista en cualquier clase', (await mark(staff.cookie, sB)).ok]);
  out.push(['Un administrador también', (await mark(admin.cookie, sA)).ok]);
  out.push(['El propietario también', (await mark(owner.cookie, sB)).ok]);

  // ── Roles personalizados ───────────────────────────────────────────────────
  const cat = (await (await call('GET', `/orgs/${orgId}/roles`, owner.cookie)).json()) as { roles: { id: string; system: boolean }[]; catalog: { resource: string }[]; canManage: boolean };
  out.push(['Lista los roles del sistema y el catálogo de permisos', cat.roles.filter((r) => r.system).length === 4 && cat.catalog.some((c) => c.resource === 'attendance') && cat.canManage]);
  const mk = (cookie: string, name: string, permissions: Record<string, string[]>) => call('POST', `/orgs/${orgId}/roles`, cookie, { name, permissions });
  out.push(['El propietario crea un rol con «pasar lista a otros»', (await mk(owner.cookie, 'Coordinador', { attendance: ['read', 'update', 'update_any'], student: ['read'] })).ok]);
  out.push(['Y otro sin ese permiso', (await mk(owner.cookie, 'Ayudante', { attendance: ['read', 'update'], student: ['read'] })).ok]);
  await setRole(custom.id, 'coordinador');
  out.push(['Con el rol «Coordinador» sí pasa lista en la clase de otro', (await mark(custom.cookie, sB)).ok]);
  await setRole(custom.id, 'ayudante');
  out.push(['Con «Ayudante» no', (await status(mark(custom.cookie, sB))) === 403]);
  const patch = await call('PATCH', `/orgs/${orgId}/roles/${encodeURIComponent('ayudante')}`, owner.cookie, { permissions: { attendance: ['read', 'update', 'update_any'] } });
  out.push(['Editar el rol surte efecto al momento', patch.ok && (await mark(custom.cookie, sB)).ok]);

  // ── Límites de lo que se puede crear ───────────────────────────────────────
  out.push(['Un administrador no puede dar permisos que no tiene (plan)', (await status(mk(admin.cookie, 'Fuga', { plan: ['manage'] }))) === 403]);
  out.push(['Un administrador crea un rol dentro de lo suyo', (await mk(admin.cookie, 'Caja tarde', { cash: ['read', 'close'] })).ok]);
  await mk(owner.cookie, 'Facturación', { plan: ['read', 'manage'], payment: ['read'] });
  const exceeds = await call('PATCH', `/orgs/${orgId}/members/${(await db.query.member.findFirst({ where: and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, staff.id)) }))!.id}`, admin.cookie, { role: 'facturación' });
  out.push(['Un administrador no asigna un rol que lo supera', exceeds.status === 403]);
  out.push(['Los nombres del sistema están reservados', (await status(mk(owner.cookie, 'admin', { cash: ['read'] }))) === 409 && (await status(mk(owner.cookie, 'Administrador', { cash: ['read'] }))) === 409 && (await status(mk(owner.cookie, 'member', { cash: ['read'] }))) === 409]);
  out.push(['Un nombre repetido se rechaza', (await status(mk(owner.cookie, 'Coordinador', { cash: ['read'] }))) === 409]);
  out.push(['Nombre inválido (coma) se rechaza', (await status(mk(owner.cookie, 'a,b', { cash: ['read'] }))) === 422]);
  out.push(['Sin permisos se rechaza', (await status(mk(owner.cookie, 'Vacío', {}))) === 422]);
  out.push(['Permisos inventados se descartan (nada válido => 422)', (await status(mk(owner.cookie, 'Falso', { cohetes: ['volar'] }))) === 422]);
  out.push(['Un instructor no puede crear roles', (await status(mk(insA.cookie, 'Hack', { cash: ['read'] }))) === 403]);
  out.push(['Alguien ajeno recibe 404', (await status(mk(outsider.cookie, 'Hack', { cash: ['read'] }))) === 404]);
  out.push(['Sin sesión recibe 401', (await status(call('POST', `/orgs/${orgId}/roles`, undefined, { name: 'Hack', permissions: { cash: ['read'] } }))) === 401]);

  const list0 = (await (await call('GET', `/orgs/${orgId}/roles`, owner.cookie)).json()) as { roles: { id: string; label: string; system: boolean }[] };
  out.push(['El nombre se guarda en minúsculas y se muestra con mayúscula', list0.roles.some((r) => r.id === 'coordinador' && r.label === 'Coordinador')]);

  // ── Equipo y roles personalizados ──────────────────────────────────────────
  const inv = await call('POST', `/orgs/${orgId}/invitations`, owner.cookie, { email: `${tag}-nuevo@example.com`, role: 'coordinador' });
  out.push(['Se puede invitar con un rol personalizado', inv.ok]);
  const badInv = await call('POST', `/orgs/${orgId}/invitations`, owner.cookie, { email: `${tag}-otro@example.com`, role: 'No existe' });
  out.push(['Invitar con un rol inexistente se rechaza', badInv.status === 422]);
  out.push(['«teach» alcanza a roles personalizados', !(await rolesWith(orgId, 'session', 'teach')).includes('coordinador') && (await rolesWith(orgId, 'session', 'teach')).includes('instructor')]);

  // ── Borrar ─────────────────────────────────────────────────────────────────
  out.push(['Un rol en uso no se borra', (await status(call('DELETE', `/orgs/${orgId}/roles/${encodeURIComponent('ayudante')}`, owner.cookie))) === 409]);
  out.push(['Un rol con invitación pendiente no se borra', (await status(call('DELETE', `/orgs/${orgId}/roles/${encodeURIComponent('coordinador')}`, owner.cookie))) === 409]);
  out.push(['Los roles del sistema no se borran ni editan', (await status(call('DELETE', `/orgs/${orgId}/roles/instructor`, owner.cookie))) === 403 && (await status(call('PATCH', `/orgs/${orgId}/roles/staff`, owner.cookie, { permissions: { cash: ['read'] } }))) === 403]);
  await setRole(custom.id, 'staff');
  out.push(['Liberado el rol, se borra', (await call('DELETE', `/orgs/${orgId}/roles/${encodeURIComponent('ayudante')}`, owner.cookie)).ok]);

  // ── Máximo 20 ───────────────────────────────────────────────────────────────
  const now = (await (await call('GET', `/orgs/${orgId}/roles`, owner.cookie)).json()) as { roles: { system: boolean }[] };
  let n = now.roles.filter((r) => !r.system).length;
  let last = 200;
  const before = n;
  for (; n < 20; n++) last = await status(mk(owner.cookie, `Extra ${n}`, { cash: ['read'] }));
  out.push(['Se llega a 20 roles personalizados', last === 200 && before < 20, `${before} → ${n}, último ${last}`]);
  out.push(['El 21 se rechaza', (await status(mk(owner.cookie, 'Uno más', { cash: ['read'] }))) === 409]);

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
