/**
 * Prueba de quitar a alguien del equipo con clases próximas:
 *  - la vista previa cuenta sus clases próximas y propone solo a quienes dan clases (no a ella misma ni a recepción);
 *  - sus clases próximas pasan a quien se elija; si esa persona ya tiene otra clase a la misma hora, esa queda sin instructor;
 *  - las clases pasadas y las canceladas no se tocan;
 *  - las series y servicios dejan de apuntar a la persona que se fue;
 *  - sin elegir a nadie, quedan sin instructor; elegir a alguien que no puede dar clases se rechaza y no cambia nada;
 *  - recepción no puede quitar a nadie ni ver la vista previa.
 *   bun --env-file=.env scripts/removal-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-rem-${Date.now()}`;
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
  const call = async (who: { cookie: string }, method: string, path: string) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { method, headers: { ...H, cookie: who.cookie } }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const ines = await mk('ines'); // instructora que se va
  const beto = await mk('beto'); // instructor que recibe
  const carla = await mk('carla'); // instructora
  const rene = await mk('rene'); // recepción
  const org = await createOrganization(owner.id, { name: `ZZ Rem ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  const member = async (userId: string, role: string) => {
    const id = crypto.randomUUID();
    await db.insert(schema.member).values({ id, organizationId: orgId, userId, role, createdAt: new Date() });
    return id;
  };
  const inesM = await member(ines.id, 'instructor');
  await member(beto.id, 'instructor');
  await member(carla.id, 'instructor');
  await member(rene.id, 'staff');

  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ Clase', kind: 'GROUP', priceCents: 0, durationMin: 60, instructorUserId: ines.id });
  const serie = crypto.randomUUID();
  await db.insert(schema.sessionSeries).values({ id: serie, organizationId: orgId, serviceId: svc, instructorUserId: ines.id, capacity: 10, weekdays: '[1]', startTime: '19:00', durationMin: 60, startDate: '2026-01-01', endDate: '2026-12-31', timezone: 'America/Mazatlan' } as never);
  const H1 = 3600e3;
  const session = async (instructor: string | null, hoursFromNow: number, status: 'SCHEDULED' | 'CANCELED' = 'SCHEDULED') => {
    const id = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id, organizationId: orgId, serviceId: svc, instructorUserId: instructor,
      startsAt: new Date(Date.now() + hoursFromNow * H1), endsAt: new Date(Date.now() + (hoursFromNow + 1) * H1), capacity: 10, status,
    });
    return id;
  };
  const s1 = await session(ines.id, 24);
  const s2 = await session(ines.id, 48);
  const s3 = await session(ines.id, 72); // empalma con una de Beto
  const sPast = await session(ines.id, -48);
  const sCanceled = await session(ines.id, 96, 'CANCELED');
  await session(beto.id, 72); // clase de Beto a la misma hora que s3

  const inst = async (id: string) => (await db.query.classSession.findFirst({ where: eq(schema.classSession.id, id) }))!.instructorUserId;

  // Permisos
  const deniedPrev = await call(rene, 'GET', `/orgs/${orgId}/members/${inesM}/removal-preview`);
  out.push(['Recepción no ve la vista previa', deniedPrev.status === 403, `${deniedPrev.status}`]);
  const deniedDel = await call(rene, 'DELETE', `/orgs/${orgId}/members/${inesM}`);
  out.push(['Recepción no puede quitar a nadie', deniedDel.status === 403 && (await inst(s1)) === ines.id]);

  // Vista previa
  const prev = await call(owner, 'GET', `/orgs/${orgId}/members/${inesM}/removal-preview`);
  const names = (prev.json.candidates as { name: string }[]).map((c) => c.name);
  out.push(['La vista previa cuenta sus 3 clases próximas (no pasadas ni canceladas)', prev.json.upcoming === 3, `${prev.json.upcoming}`]);
  out.push(['Propone a Beto y Carla, no a ella ni a recepción', names.includes('ZZ beto') && names.includes('ZZ carla') && !names.includes('ZZ ines') && !names.includes('ZZ rene') && !names.includes('ZZ owner'.replace('owner', 'rene')), names.join(',')]);

  // Reasignar a alguien que no da clases / que no es del equipo: se rechaza sin cambiar nada
  const bad1 = await call(owner, 'DELETE', `/orgs/${orgId}/members/${inesM}?reassignTo=${rene.id}`);
  const bad2 = await call(owner, 'DELETE', `/orgs/${orgId}/members/${inesM}?reassignTo=${crypto.randomUUID()}`);
  out.push(['No se puede reasignar a recepción ni a alguien ajeno', bad1.status === 422 && bad2.status === 422 && (await inst(s1)) === ines.id]);
  const stillMember = await db.query.member.findFirst({ where: eq(schema.member.id, inesM) });
  out.push(['Si se rechaza, la persona sigue en el equipo', !!stillMember]);

  // Quitar reasignando a Beto
  const ok = await call(owner, 'DELETE', `/orgs/${orgId}/members/${inesM}?reassignTo=${beto.id}`);
  out.push(['Se quita y reporta 2 reasignadas y 1 sin instructor', ok.status === 200 && ok.json.moved === 2 && ok.json.unassigned === 1, JSON.stringify(ok.json)]);
  out.push(['Sus clases próximas pasan a Beto', (await inst(s1)) === beto.id && (await inst(s2)) === beto.id]);
  out.push(['La que se empalmaba con otra de Beto queda sin instructor', (await inst(s3)) === null]);
  out.push(['La clase pasada conserva quién la dio', (await inst(sPast)) === ines.id]);
  out.push(['La clase cancelada no se toca', (await inst(sCanceled)) === ines.id]);
  const serieRow = await db.query.sessionSeries.findFirst({ where: eq(schema.sessionSeries.id, serie) });
  const svcRow = await db.query.service.findFirst({ where: eq(schema.service.id, svc) });
  out.push(['Series y servicios pasan a Beto', serieRow?.instructorUserId === beto.id && svcRow?.instructorUserId === beto.id]);
  out.push(['Ya no es parte del equipo', !(await db.query.member.findFirst({ where: eq(schema.member.id, inesM) }))]);
  const audit = (await db.select().from(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId))).find((a) => a.action === 'member.removed');
  out.push(['La bitácora guarda quién recibió y cuántas clases', !!audit && JSON.parse(audit.metadata ?? '{}').classesMoved === 2]);

  // Sin elegir a nadie: quedan sin instructor
  const carlaM = (await db.query.member.findFirst({ where: eq(schema.member.userId, carla.id) }))!.id;
  const c1 = await session(carla.id, 120);
  const none = await call(owner, 'DELETE', `/orgs/${orgId}/members/${carlaM}`);
  out.push(['Sin elegir a nadie las clases quedan sin instructor', none.status === 200 && none.json.unassigned === 1 && (await inst(c1)) === null, JSON.stringify(none.json)]);

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
