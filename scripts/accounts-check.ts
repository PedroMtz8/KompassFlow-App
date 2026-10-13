/**
 * Prueba de cuentas creadas por la academia con contraseña temporal:
 *  - se crean (alumno y personal) y quedan vinculadas a la academia;
 *  - mientras no cambien la contraseña, la API solo deja ver la seguridad y cambiarla (403 en lo demás);
 *  - al cambiarla se cierran las demás sesiones y la cuenta queda libre;
 *  - quien la creó ya no puede restablecerla; la caducidad se respeta; permisos y duplicados.
 *   bun --env-file=.env scripts/accounts-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const tag = `zz-acc-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  api.handle(new Request(`http://localhost/api${path}`, { method, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));

async function signUp(label: string) {
  const r = await call('POST', '/auth/sign-up/email', undefined, { email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` });
  const id = ((await r.json()) as { user: { id: string } }).user.id;
  ids.push(id);
  return { id, cookie: cookieOf(r) };
}
const signIn = async (email: string, password: string) => {
  const r = await call('POST', '/auth/sign-in/email', undefined, { email, password });
  return { ok: r.ok, cookie: cookieOf(r) };
};

try {
  const owner = await signUp('owner');
  const stranger = await signUp('stranger');
  const org = await createOrganization(owner.id, {
    name: `ZZ Acc ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 20,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  // ── Crear un alumno con cuenta ─────────────────────────────────────────────
  const email = `${tag}-ana@example.com`;
  const created = await call('POST', `/orgs/${orgId}/accounts`, owner.cookie, { kind: 'student', name: 'Ana Prueba', email });
  const acc = (await created.json()) as { userId: string; password: string; expiresAt: string };
  if (acc.userId) ids.push(acc.userId);
  out.push(['El dueño crea la cuenta de un alumno', created.ok && !!acc.password && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(acc.password)]);
  const st = await db.query.student.findFirst({ where: eq(schema.student.userId, acc.userId) });
  out.push(['Queda vinculada a la academia como alumna', st?.organizationId === orgId]);
  const dup = await call('POST', `/orgs/${orgId}/accounts`, owner.cookie, { kind: 'student', name: 'Otra', email });
  out.push(['Un correo que ya tiene cuenta se rechaza', dup.status === 409]);
  const noPerm = await call('POST', `/orgs/${orgId}/accounts`, stranger.cookie, { kind: 'student', name: 'X Y', email: `${tag}-x@example.com` });
  out.push(['Quien no es de la academia recibe 404', noPerm.status === 404]);
  const anon = await call('POST', `/orgs/${orgId}/accounts`, undefined, { kind: 'student', name: 'X Y', email: `${tag}-y@example.com` });
  out.push(['Sin sesión recibe 401', anon.status === 401]);

  // ── Entrar con la contraseña temporal: solo seguridad y cambio de contraseña ─
  const s1 = await signIn(email, acc.password);
  out.push(['Entra con la contraseña temporal', s1.ok]);
  const sec = (await (await call('GET', '/me/security', s1.cookie)).json()) as { mustChangePassword: boolean; credentialsExpired: boolean };
  out.push(['Seguridad avisa que debe cambiarla', sec.mustChangePassword === true && sec.credentialsExpired === false]);
  const blocked = await call('GET', '/me/bookings?scope=upcoming', s1.cookie);
  out.push(['El resto de la API responde 403 mientras tanto', blocked.status === 403]);
  const blockedOrg = await call('GET', `/orgs/${orgId}/students`, s1.cookie);
  out.push(['También las rutas de la academia', blockedOrg.status === 403]);

  // Una segunda sesión (como quien creó la cuenta y guardó las credenciales).
  const sCreator = await signIn(email, acc.password);

  const same = await call('POST', '/me/password/replace', s1.cookie, { currentPassword: acc.password, newPassword: acc.password });
  out.push(['La nueva contraseña no puede ser la temporal', same.status === 422]);
  const wrong = await call('POST', '/me/password/replace', s1.cookie, { currentPassword: 'incorrecta-123', newPassword: 'mi-clave-nueva-1' });
  out.push(['Con una temporal incorrecta se rechaza', wrong.status === 400]);
  const short = await call('POST', '/me/password/replace', s1.cookie, { currentPassword: acc.password, newPassword: 'corta' });
  out.push(['Una contraseña corta se rechaza', short.status === 422]);

  // Restablecer funciona mientras no la active (la contraseña anterior deja de servir).
  const reset = await call('POST', `/orgs/${orgId}/accounts/${acc.userId}/reset`, owner.cookie);
  const acc2 = (await reset.json()) as { password: string };
  out.push(['La academia puede regenerar mientras no se active', reset.ok && acc2.password !== acc.password]);
  out.push(['La contraseña anterior ya no sirve', !(await signIn(email, acc.password)).ok]);
  const s2 = await signIn(email, acc2.password);

  const ok = await call('POST', '/me/password/replace', s2.cookie, { currentPassword: acc2.password, newPassword: 'mi-clave-nueva-1' });
  out.push(['Cambia la contraseña temporal por la suya', ok.ok]);
  const free = await call('GET', '/me/bookings?scope=upcoming', s2.cookie);
  out.push(['Después ya usa la API con normalidad', free.ok, String(free.status)]);
  const old = await call('GET', '/me', sCreator.cookie);
  out.push(['Las demás sesiones se cerraron (quien la creó pierde el acceso)', old.status === 401]);
  out.push(['Ya no entra con la temporal', !(await signIn(email, acc2.password)).ok]);
  out.push(['Entra con la nueva', (await signIn(email, 'mi-clave-nueva-1')).ok]);
  const late = await call('POST', `/orgs/${orgId}/accounts/${acc.userId}/reset`, owner.cookie);
  out.push(['Una cuenta activada ya no se puede restablecer', late.status === 409]);

  // ── Caducidad ───────────────────────────────────────────────────────────────
  const email2 = `${tag}-beto@example.com`;
  const c2 = (await (await call('POST', `/orgs/${orgId}/accounts`, owner.cookie, { kind: 'student', name: 'Beto Prueba', email: email2 })).json()) as { userId: string; password: string };
  ids.push(c2.userId);
  await db.update(schema.user).set({ tempPasswordExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.user.id, c2.userId));
  const e1 = await signIn(email2, c2.password);
  const secE = (await (await call('GET', '/me/security', e1.cookie)).json()) as { credentialsExpired: boolean };
  out.push(['Una contraseña temporal caducada se marca como caducada', secE.credentialsExpired === true]);
  const exp = await call('POST', '/me/password/replace', e1.cookie, { currentPassword: c2.password, newPassword: 'otra-clave-nueva-1' });
  out.push(['No se puede activar con credenciales caducadas', exp.status === 403]);
  const regen = await call('POST', `/orgs/${orgId}/accounts/${c2.userId}/reset`, owner.cookie);
  out.push(['La academia regenera y vuelve a servir', regen.ok]);

  // ── Personal ────────────────────────────────────────────────────────────────
  const c3 = await call('POST', `/orgs/${orgId}/accounts`, owner.cookie, { kind: 'staff', role: 'instructor', name: 'Ines Instructora', email: `${tag}-ines@example.com` });
  const j3 = (await c3.json()) as { userId: string; password: string };
  if (j3.userId) ids.push(j3.userId);
  const m = await db.query.member.findFirst({ where: eq(schema.member.userId, j3.userId) });
  out.push(['Crea personal ya como miembro con su rol', c3.ok && m?.organizationId === orgId && m.role === 'instructor']);
  const noRole = await call('POST', `/orgs/${orgId}/accounts`, owner.cookie, { kind: 'staff', name: 'Sin Rol', email: `${tag}-sr@example.com` });
  out.push(['El personal exige un rol', noRole.status === 422]);
  // Un instructor no puede crear cuentas.
  const sI = await signIn(`${tag}-ines@example.com`, j3.password);
  await call('POST', '/me/password/replace', sI.cookie, { currentPassword: j3.password, newPassword: 'clave-ines-123' });
  const sI2 = await signIn(`${tag}-ines@example.com`, 'clave-ines-123');
  const byInstructor = await call('POST', `/orgs/${orgId}/accounts`, sI2.cookie, { kind: 'student', name: 'Zed Zeta', email: `${tag}-zed@example.com` });
  out.push(['Un instructor no puede crear cuentas', byInstructor.status === 403]);
  const team = (await (await call('GET', `/orgs/${orgId}/team`, owner.cookie)).json()) as { members: { userId: string; pendingActivation: boolean }[] };
  out.push(['El equipo marca la cuenta por activar solo mientras no la cambia', team.members.some((x) => x.userId === j3.userId && x.pendingActivation === false)]);

  for (const [name, pass, detail] of out) console.log(`${pass ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, p]) => !p)) process.exitCode = 1;
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
