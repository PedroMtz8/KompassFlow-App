/**
 * Zona horaria de la academia: valida el identificador y no deja cambiarla si hay clases próximas
 * (cambiarla movería su hora local).   bun --env-file=.env scripts/timezone-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { createOrganization, updateOrganization } from '../src/server/db/organizations';

const tag = `zz-tz-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
try {
  const r = await auth.api.signUpEmail({ body: { email: `${tag}@example.com`, password: 'clave-segura-123', name: 'ZZ tz' } });
  ids.push(r.user.id);
  const bad = await createOrganization(r.user.id, {
    name: `ZZ ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    city: 'Tepic',
    timezone: 'Mars/Olympus',
    roomName: 'S',
    roomCapacity: 5,
  } as never);
  out.push(['Zona inválida al crear se rechaza', 'error' in bad && bad.error === 'INVALID_TIMEZONE']);
  const org = await createOrganization(r.user.id, {
    name: `ZZ ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    city: 'Tepic',
    timezone: 'America/Mazatlan',
    roomName: 'S',
    roomCapacity: 5,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  const get = async () =>
    (await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, orgId) }))!.timezone;
  out.push(['Se crea con la zona elegida', (await get()) === 'America/Mazatlan']);
  const inv = await updateOrganization(r.user.id, orgId, { timezone: 'Nope/Zone' });
  out.push(['Zona inválida al editar se rechaza', 'error' in inv && inv.error === 'INVALID_TIMEZONE']);
  const free = await updateOrganization(r.user.id, orgId, { timezone: 'America/Mexico_City' });
  out.push(['Sin clases próximas se puede cambiar', 'ok' in free && (await get()) === 'America/Mexico_City']);

  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const room = (await db.select().from(schema.room).where(eq(schema.room.organizationId, orgId)))[0];
  await db
    .insert(schema.classSession)
    .values({
      organizationId: orgId,
      serviceId: svc,
      roomId: room.id,
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      capacity: 3,
      status: 'SCHEDULED',
    });
  const blocked = await updateOrganization(r.user.id, orgId, { timezone: 'America/Mazatlan' });
  out.push([
    'Con clases próximas no se puede cambiar',
    'error' in blocked && blocked.error === 'TIMEZONE_HAS_SESSIONS' && (await get()) === 'America/Mexico_City',
  ]);
  const same = await updateOrganization(r.user.id, orgId, { timezone: 'America/Mexico_City', name: 'ZZ renombrada' });
  out.push(['Reenviar la misma zona no estorba', 'ok' in same]);

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
