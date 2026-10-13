/**
 * Prueba de las listas por páginas:
 *  - alumnos: las páginas juntas son TODOS los alumnos, sin repetir ni saltarse a nadie (aunque haya nombres iguales);
 *  - la búsqueda y los permisos de contacto siguen funcionando por páginas;
 *  - mis reservas: más de una página, el detalle por id encuentra una reserva antigua y no abre la de otra persona;
 *  - los totales («clases tomadas», academias) no dependen de las páginas cargadas;
 *  - límites inválidos se rechazan.
 *   bun --env-file=.env scripts/pagination-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { api } from '../src/server/app';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';

const H = { 'content-type': 'application/json', origin: 'http://localhost:8081' };
const tag = `zz-pag-${Date.now()}`;
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
  const get = async (who: { cookie: string }, path: string) => {
    const r = await api.handle(new Request('http://localhost/api' + path, { headers: { ...H, cookie: who.cookie } }));
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const owner = await mk('owner');
  const ana = await mk('ana');
  const bea = await mk('bea');
  const org = await createOrganization(owner.id, { name: `ZZ Pag ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  // ── Alumnos ────────────────────────────────────────────────────────────────
  // 75 alumnos; 20 se llaman igual para comprobar el desempate.
  const rows = Array.from({ length: 75 }, (_, i) => ({ id: `${tag}-s${String(i).padStart(3, '0')}`, organizationId: orgId, name: i < 20 ? 'Alumno Repetido' : `Alumno ${String(i).padStart(3, '0')}`, phone: `55${String(i).padStart(8, '0')}` }));
  await db.insert(schema.student).values(rows);
  const all: string[] = [];
  let pages = 0;
  for (let offset = 0; ; offset += 30) {
    const p = await get(owner, `/orgs/${orgId}/students?limit=30&offset=${offset}`);
    if (p.status !== 200) throw new Error(`página ${offset}: ${p.status}`);
    all.push(...p.json.map((s: any) => s.id));
    pages++;
    if (p.json.length < 30) break;
  }
  out.push(['Las páginas suman los 75 alumnos', all.length === 75 && pages === 3, `${all.length} en ${pages} páginas`]);
  out.push(['Sin repetidos ni huecos (con nombres iguales)', new Set(all).size === 75 && rows.every((r) => all.includes(r.id))]);
  const first = await get(owner, `/orgs/${orgId}/students`);
  out.push(['Sin parámetros se devuelve la primera página de 50', first.json.length === 50]);
  const search = await get(owner, `/orgs/${orgId}/students?q=Repetido&limit=10&offset=10`);
  out.push(['La búsqueda también se pagina', search.json.length === 10 && search.json.every((s: any) => s.name === 'Alumno Repetido')]);
  for (const bad of ['limit=0', 'limit=101', 'offset=-1', 'limit=abc']) {
    const r = await get(owner, `/orgs/${orgId}/students?${bad}`);
    out.push([`Se rechaza ${bad}`, r.status === 422, `${r.status}`]);
  }
  const noOrg = await get(ana, `/orgs/${orgId}/students`);
  out.push(['Quien no es de la academia no ve alumnos', noOrg.status === 404]);

  // ── Mis reservas ───────────────────────────────────────────────────────────
  const service = crypto.randomUUID();
  await db.insert(schema.service).values({ id: service, organizationId: orgId, name: 'ZZ Clase', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const st = async (userId: string, name: string) => {
    const id = crypto.randomUUID();
    await db.insert(schema.student).values({ id, organizationId: orgId, userId, name });
    return id;
  };
  const anaSt = await st(ana.id, 'Ana');
  const beaSt = await st(bea.id, 'Bea');
  const DAY = 24 * 3600e3;
  const book = async (studentId: string, daysAgo: number, present = false) => {
    const sid = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id: sid,
      organizationId: orgId,
      serviceId: service,
      startsAt: new Date(Date.now() - daysAgo * DAY),
      endsAt: new Date(Date.now() - daysAgo * DAY + 3600e3),
      capacity: 10,
      status: 'SCHEDULED',
    });
    const bid = crypto.randomUUID();
    await db.insert(schema.booking).values({ id: bid, organizationId: orgId, sessionId: sid, studentId, status: 'CONFIRMED', source: 'STAFF' });
    if (present) await db.insert(schema.attendance).values({ organizationId: orgId, sessionId: sid, bookingId: bid, studentId, status: 'PRESENT' });
    return bid;
  };
  const anaPast: string[] = [];
  for (let i = 1; i <= 65; i++) anaPast.push(await book(anaSt, i + 1, i % 2 === 0)); // 65 pasadas, 32 asistidas
  for (let i = 1; i <= 3; i++) await book(anaSt, -i); // 3 próximas
  const beaBooking = await book(beaSt, 5, true);

  const seen: string[] = [];
  for (let offset = 0; ; offset += 30) {
    const p = await get(ana, `/me/bookings?scope=past&limit=30&offset=${offset}`);
    seen.push(...p.json.map((b: any) => b.id));
    if (p.json.length < 30) break;
  }
  out.push(['El historial completo llega en 3 páginas sin repetir', seen.length === 65 && new Set(seen).size === 65, `${seen.length}`]);
  out.push(['Va de la más reciente a la más antigua', seen[0] === anaPast[0] && seen.at(-1) === anaPast[64]]);
  const up = await get(ana, '/me/bookings?scope=upcoming');
  out.push(['Las próximas aparecen en su lista', up.json.length === 3]);
  const oldest = await get(ana, `/me/bookings/${anaPast[64]}`);
  out.push(['El detalle encuentra la reserva más antigua', oldest.status === 200 && oldest.json.id === anaPast[64]]);
  const foreign = await get(ana, `/me/bookings/${beaBooking}`);
  out.push(['No se abre la reserva de otra persona', foreign.status === 404, `${foreign.status}`]);
  const sum = await get(ana, '/me/bookings/summary');
  out.push(['Los totales cuentan todo, no solo la primera página', sum.json.attended === 32 && sum.json.orgs === 1, JSON.stringify(sum.json)]);
  const sumBea = await get(bea, '/me/bookings/summary');
  out.push(['Cada persona ve sus propios totales', sumBea.json.attended === 1]);

  // ── Pagos de la academia ───────────────────────────────────────────────────
  const payNow = Date.now();
  // A mitad del mes anterior: así ningún pago cae cerca de un cambio de mes en ninguna zona horaria.
  const nowD = new Date(payNow);
  const lastMonth = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 15, 18);
  const pays = Array.from({ length: 60 }, (_, i) => ({
    id: `${tag}-p${String(i).padStart(3, '0')}`,
    organizationId: orgId,
    studentId: `${tag}-s${String((i % 55) + 20).padStart(3, '0')}`,
    concept: i % 2 ? 'Pase de 1 clase' : 'Membresía mensual',
    amountCents: 10000 + i,
    method: 'CASH' as const,
    status: 'PAID' as const,
    reference: i === 7 ? 'REF-ESPECIAL-77' : null,
    paidAt: new Date(i < 50 ? payNow - i * 60_000 : lastMonth - i * 60_000),
    createdAt: new Date(i < 50 ? payNow - i * 60_000 : lastMonth - i * 60_000),
  }));
  await db.insert(schema.payment).values(pays);
  const thisMonth = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Mexico_City' }).format(payNow).slice(0, 7);
  const paySeen: string[] = [];
  for (let offset = 0; ; offset += 20) {
    const p = await get(owner, `/orgs/${orgId}/payments?month=${thisMonth}&limit=20&offset=${offset}`);
    if (p.status !== 200) throw new Error(`pagos ${offset}: ${p.status}`);
    paySeen.push(...p.json.map((x: any) => x.id));
    if (p.json.length < 20) break;
  }
  out.push(['Pagos del mes por páginas: 50, sin repetir', paySeen.length === 50 && new Set(paySeen).size === 50, `${paySeen.length}`]);
  const byName = await get(owner, `/orgs/${orgId}/payments?q=${encodeURIComponent('alumno 050')}`);
  out.push(['Buscar por alumno', byName.json.length === 1 && byName.json[0].studentName === 'Alumno 050', `${byName.json.length}`]);
  const byConcept = await get(owner, `/orgs/${orgId}/payments?q=${encodeURIComponent('pase de 1')}&limit=100`);
  out.push(['Buscar por clase o paquete (en todo el historial)', byConcept.json.length === 30, `${byConcept.json.length}`]);
  const byRef = await get(owner, `/orgs/${orgId}/payments?q=especial-77`);
  out.push(['Buscar por referencia', byRef.json.length === 1]);
  const wild = await get(owner, `/orgs/${orgId}/payments?q=${encodeURIComponent('%')}`);
  out.push(['El % se busca como texto, no como comodín', wild.json.length === 0, `${wild.json.length}`]);
  const prev = await get(owner, `/orgs/${orgId}/payments?month=${new Date(lastMonth).toISOString().slice(0, 7)}&limit=100`);
  out.push(['El mes anterior trae solo sus pagos', prev.json.length === 10, `${prev.json.length}`]);
  const stranger = await get(ana, `/orgs/${orgId}/payments`);
  out.push(['Quien no es de la academia no ve pagos', stranger.status === 403 || stranger.status === 404, `${stranger.status}`]);

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
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
  process.exit(process.exitCode ?? 0);
}
