/**
 * Prueba de punta a punta de las subidas (portada y foto de perfil) contra un S3 falso local, llamando a la API
 * en proceso. Verifica permisos, validación del contenido, reemplazo (borra el archivo anterior) y quitar portada.
 *   bun --env-file=.env scripts/uploads-check.ts
 */
import { createServer } from 'node:http';

import { eq, inArray } from 'drizzle-orm';

const calls: { method: string; path: string }[] = [];
const s3 = createServer((req, res) => {
  calls.push({ method: req.method ?? '', path: new URL(req.url ?? '/', 'http://x').pathname });
  req.resume();
  req.on('end', () => {
    res.statusCode = req.method === 'PUT' ? 200 : 204;
    res.end();
  });
});
await new Promise<void>((r) => s3.listen(0, r));
const port = (s3.address() as { port: number }).port;
Object.assign(process.env, {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'AKIATEST',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_PUBLIC_URL: 'https://cdn.example.com',
  R2_ENDPOINT: `http://localhost:${port}`,
});

const { api } = await import('../src/server/app');
const { db, schema } = await import('../src/server/db');
const { createOrganization } = await import('../src/server/db/organizations');

const tag = `zz-up-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };

async function signUp(label: string) {
  const r = await api.handle(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }),
    })
  );
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const id = ((await r.json()) as { user: { id: string } }).user.id;
  ids.push(id);
  return { id, cookie };
}
// PNG real de 1×1 píxel (Elysia verifica el contenido del archivo, no solo su tipo declarado).
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0)
);
const upload = async (path: string, cookie: string | undefined, bytes: Uint8Array, type = 'image/png', name = 'foto.png') => {
  const form = new FormData();
  form.append('file', new File([bytes as BlobPart], name, { type }));
  const r = await api.handle(
    new Request(`http://localhost/api${path}`, { method: 'POST', headers: { origin: H.origin, ...(cookie ? { cookie } : {}) }, body: form })
  );
  return { status: r.status, body: (await r.json().catch(() => ({}))) as { url?: string; message?: string } };
};

try {
  const owner = await signUp('owner');
  const outsider = await signUp('outsider');
  const instructor = await signUp('instructor');
  const org = await createOrganization(owner.id, {
    name: `ZZ Up ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 5,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db
    .insert(schema.member)
    .values({ id: crypto.randomUUID(), organizationId: orgId, userId: instructor.id, role: 'instructor', createdAt: new Date() } as never);

  out.push(['Anónimo no sube portada', (await upload(`/orgs/${orgId}/cover`, undefined, png)).status === 401]);
  out.push(['Ajeno recibe 404', (await upload(`/orgs/${orgId}/cover`, outsider.cookie, png)).status === 404]);
  out.push(['Instructor recibe 403', (await upload(`/orgs/${orgId}/cover`, instructor.cookie, png)).status === 403]);
  const fake = await upload(`/orgs/${orgId}/cover`, owner.cookie, new TextEncoder().encode('<html><script>alert(1)</script></html>'));
  out.push(['HTML disfrazado de PNG se rechaza', fake.status === 415 || fake.status === 422, `${fake.status}`]);
  const big = await upload(`/orgs/${orgId}/cover`, owner.cookie, new Uint8Array(5 * 1024 * 1024 + 10).fill(1));
  out.push(['Más de 5 MB se rechaza', big.status === 413 || big.status === 422, `${big.status}`]);

  const ok = await upload(`/orgs/${orgId}/cover`, owner.cookie, png);
  out.push([
    'Propietario sube portada',
    ok.status === 200 && !!ok.body.url?.startsWith('https://cdn.example.com/orgs/'),
    `${ok.status} ${ok.body.url ?? ok.body.message}`,
  ]);
  const row = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, orgId) });
  out.push(['La URL queda guardada', row?.coverImage === ok.body.url]);
  out.push([
    'Se hizo PUT a R2 con la clave de la academia',
    calls.some((c) => c.method === 'PUT' && c.path.startsWith(`/bucket/orgs/${orgId}/cover-`)),
  ]);

  const putsBefore = calls.filter((c) => c.method === 'PUT').length;
  const second = await upload(`/orgs/${orgId}/cover`, owner.cookie, png);
  out.push([
    'Reemplazar borra la portada anterior',
    second.status === 200 && calls.some((c) => c.method === 'DELETE') && calls.filter((c) => c.method === 'PUT').length === putsBefore + 1,
  ]);

  const del = await api.handle(
    new Request(`http://localhost/api/orgs/${orgId}/cover`, { method: 'DELETE', headers: { ...H, cookie: owner.cookie } })
  );
  const after = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, orgId) });
  out.push(['Quitar portada', del.status === 200 && after?.coverImage === null]);

  const av = await upload('/me/avatar', owner.cookie, png);
  const user = await db.query.user.findFirst({ where: eq(schema.user.id, owner.id) });
  out.push([
    'Foto de perfil actualiza user.image',
    av.status === 200 && user?.image === av.body.url && !!av.body.url?.includes(`/users/${owner.id}/`),
  ]);

  // Logo de la academia (su «foto de perfil»).
  const logo = await upload(`/orgs/${orgId}/logo`, owner.cookie, png);
  const orgRow = await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) });
  out.push([
    'Propietario sube el logo',
    logo.status === 200 && orgRow?.logo === logo.body.url && !!logo.body.url?.includes(`/orgs/${orgId}/logo-`),
    `${logo.status}`,
  ]);
  out.push(['Instructor no cambia el logo', (await upload(`/orgs/${orgId}/logo`, instructor.cookie, png)).status === 403]);
  const delLogo = await api.handle(
    new Request(`http://localhost/api/orgs/${orgId}/logo`, { method: 'DELETE', headers: { ...H, cookie: owner.cookie } })
  );
  const noLogo = await db.query.organization.findFirst({ where: eq(schema.organization.id, orgId) });
  out.push(['Quitar logo', delLogo.status === 200 && noLogo?.logo === null]);

  // Volver a la foto de Google: se lee del id token guardado al entrar con Google.
  const google = 'https://lh3.googleusercontent.com/a/foto-original';
  const idToken = ['x', btoa(JSON.stringify({ picture: google })).replace(/=+$/, ''), 'y'].join('.');
  await db
    .insert(schema.account)
    .values({ id: crypto.randomUUID(), accountId: `g-${owner.id}`, providerId: 'google', userId: owner.id, idToken } as never);
  const reset = await api.handle(
    new Request('http://localhost/api/me/avatar', { method: 'DELETE', headers: { ...H, cookie: owner.cookie } })
  );
  const back = await db.query.user.findFirst({ where: eq(schema.user.id, owner.id) });
  out.push(['Quitar mi foto vuelve a la de Google', reset.status === 200 && back?.image === google, back?.image ?? '']);
  const putsAfter = calls.filter((c) => c.method === 'DELETE').length;
  out.push(['Se borró del bucket la foto subida', putsAfter >= 3]);

  for (const [name, pass, detail] of out) console.log(`${pass ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, pass]) => !pass)) process.exitCode = 1;
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
  s3.close();
  process.exit(process.exitCode ?? 0);
}
