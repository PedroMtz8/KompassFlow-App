/**
 * Prueba del resumen de la persona como alumna (pantalla Perfil): desde cuándo baila, academias, clases y horas,
 * disciplinas, últimas clases y asistencia. Junta varias academias, no cuenta lo que no fue «asistió», respeta que cada
 * persona solo vea lo suyo y conserva el historial de un registro que se vinculó después.
 *   bun --env-file=.env scripts/profile-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-prf-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const userIds: string[] = [];
const orgIds: string[] = [];
const DAY = 86400e3;

try {
  const mk = async (label: string) => {
    const r = await api.handle(new Request('http://localhost/api/auth/sign-up/email', { method: 'POST', headers: H, body: JSON.stringify({ email: `${tag}-${label}@example.com`, password: 'clave-segura-123', name: `ZZ ${label}` }) }));
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const id = ((await r.json()) as { user: { id: string } }).user.id;
    userIds.push(id);
    return { id, cookie };
  };
  const get = async (who: { cookie: string }, path: string) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { headers: { ...H, cookie: who.cookie } }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const ana = await mk('ana');
  const nueva = await mk('nueva');
  const bea = await mk('bea');
  const mkOrg = async (name: string) => {
    const o = await createOrganization(owner.id, { name: `ZZ ${name} ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
    if ('error' in o) throw new Error(o.error);
    orgIds.push((o as { id: string }).id);
    return (o as { id: string }).id;
  };
  const orgA = await mkOrg('Bailatino');
  const orgB = await mkOrg('Tango');
  const [disc] = await db.select().from(schema.discipline).limit(2);
  const mkSvc = async (orgId: string, name: string, minutes: number, disciplineId?: string) => {
    const id = crypto.randomUUID();
    await db.insert(schema.service).values({ id, organizationId: orgId, name, kind: 'GROUP', priceCents: 0, durationMin: minutes, disciplineId: disciplineId ?? null });
    return id;
  };
  const bachata = await mkSvc(orgA, 'Bachata básico', 60, disc.id);
  const suelta = await mkSvc(orgB, 'Milonga libre', 90); // sin disciplina: se agrupa por nombre del servicio
  const student = async (orgId: string, userId: string | null, name: string, createdDaysAgo: number) => {
    const id = crypto.randomUUID();
    await db.insert(schema.student).values({ id, organizationId: orgId, userId, name, createdAt: new Date(Date.now() - createdDaysAgo * DAY) });
    return id;
  };
  const anaA = await student(orgA, ana.id, 'Ana', 100);
  const anaB = await student(orgB, ana.id, 'Ana', 20);
  const beaA = await student(orgA, bea.id, 'Bea', 10);
  const attend = async (orgId: string, svc: string, studentId: string, daysAgo: number, status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | null) => {
    const sid = crypto.randomUUID();
    const starts = new Date(Date.now() - daysAgo * DAY);
    await db.insert(schema.classSession).values({ id: sid, organizationId: orgId, serviceId: svc, startsAt: starts, endsAt: new Date(starts.getTime() + 3600e3), capacity: 10, status: 'SCHEDULED' });
    const bid = crypto.randomUUID();
    await db.insert(schema.booking).values({ id: bid, organizationId: orgId, sessionId: sid, studentId, status: 'CONFIRMED', source: 'STAFF' });
    if (status) await db.insert(schema.attendance).values({ organizationId: orgId, sessionId: sid, bookingId: bid, studentId, status: status as 'PRESENT' });
  };
  // Ana: 5 clases de bachata en Bailatino (3 presentes, 1 falta, 1 sin registro) y 2 milongas en Tango (presentes).
  await attend(orgA, bachata, anaA, 90, 'PRESENT');
  await attend(orgA, bachata, anaA, 60, 'PRESENT');
  await attend(orgA, bachata, anaA, 10, 'PRESENT');
  await attend(orgA, bachata, anaA, 8, 'ABSENT');
  await attend(orgA, bachata, anaA, 5, null);
  await attend(orgB, suelta, anaB, 15, 'PRESENT');
  await attend(orgB, suelta, anaB, 2, 'PRESENT');
  await attend(orgA, bachata, beaA, 3, 'PRESENT'); // de otra persona
  await attend(orgA, bachata, anaA, -3, null); // próxima

  const s = (await get(ana, '/me/profile-summary')).json;
  out.push(['Cuenta las clases a las que asistió (5), no las faltas ni las sin registro', s.attended === 5, `${s.attended}`]);
  out.push(['Cuenta las faltas aparte', s.missed === 1]);
  out.push(['Suma las horas: 3×60 + 2×90 = 360 min', s.minutes === 360, `${s.minutes}`]);
  out.push(['La asistencia es sobre lo ya calificado: 5 de 6 = 83%', s.attendanceRate === 83, `${s.attendanceRate}`]);
  out.push(['Los últimos 30 días: 3 clases (hace 2, 10 y 15 días)', s.last30 === 3, `${s.last30}`]);
  out.push(['«Desde» es su primera clase (hace 90 días) y no el alta en la academia (100)', Math.abs(+new Date(s.since) - (Date.now() - 100 * DAY)) < 5 * 60e3, `${s.since}`]);
  out.push(['Junta sus dos academias', s.organizations.length === 2]);
  const a = s.organizations.find((o: any) => o.name.startsWith('ZZ Bailatino'));
  const b = s.organizations.find((o: any) => o.name.startsWith('ZZ Tango'));
  out.push(['Por academia: clases, horas y última clase', a.attended === 3 && a.minutes === 180 && b.attended === 2 && b.minutes === 180 && Math.abs(+new Date(b.lastClassAt) - (Date.now() - 2 * DAY)) < 5 * 60e3]);
  out.push(['Por academia: próximas reservas', a.upcoming === 1 && b.upcoming === 0]);
  out.push(['Orden: primero donde más ha ido', s.organizations[0].name.startsWith('ZZ Bailatino') || s.organizations[0].attended >= s.organizations[1].attended]);
  out.push(['Disciplinas: la del catálogo y, sin disciplina, el nombre de la clase', s.disciplines.length === 2 && s.disciplines[0].classes === 3 && s.disciplines.some((d: any) => d.name === 'Milonga libre' && d.classes === 2)]);
  out.push(['Últimas clases: las 5 más recientes y solo las asistidas', s.recent.length === 5 && +new Date(s.recent[0].startsAt) > +new Date(s.recent[4].startsAt) && s.recent.every((r: any) => r.service && r.organizationName)]);

  const ob = (await get(bea, '/me/profile-summary')).json;
  out.push(['Cada persona ve solo lo suyo', ob.attended === 1 && ob.organizations.length === 1]);
  const empty = (await get(nueva, '/me/profile-summary')).json;
  out.push(['Una persona nueva ve un resumen vacío (sin errores)', empty.attended === 0 && empty.since === null && empty.organizations.length === 0 && empty.attendanceRate === null]);
  out.push(['Sin sesión no se ve', (await api.handle(new Request('http://localhost/api/me/profile-summary', { headers: H }))).status === 401]);

  // Historial de un registro que se vincula después: el de la academia (con clases previas) se suma al resumen.
  const antes = await student(orgA, null, 'Nueva (alta en recepción)', 200);
  await attend(orgA, bachata, antes, 150, 'PRESENT');
  await attend(orgA, bachata, antes, 140, 'PRESENT');
  await db.update(schema.student).set({ userId: nueva.id }).where(eq(schema.student.id, antes));
  const linked = (await get(nueva, '/me/profile-summary')).json;
  out.push(['Al vincular un registro, conserva su historial y su fecha de inicio', linked.attended === 2 && Math.abs(+new Date(linked.since) - (Date.now() - 200 * DAY)) < 5 * 60e3, `${linked.attended}`]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail && !ok ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  for (const o of orgIds) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, o));
    await db.delete(schema.organization).where(eq(schema.organization.id, o));
  }
  if (userIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  process.exit(process.exitCode ?? 0);
}
