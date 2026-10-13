/**
 * Prueba de paquetes compartidos entre varias personas (p. ej. «$700 una persona / $1,000 dos personas»):
 *  - el producto define cuántas personas incluye; se vende con una sola y se suman las demás después (sin cuenta);
 *  - los lugares no se pueden exceder (ni con altas simultáneas) y el titular no se quita;
 *  - los créditos son un fondo común: la asistencia de cualquier miembro los consume;
 *  - cada persona ve el paquete compartido y los demás pases siguen funcionando igual.
 *   bun --env-file=.env scripts/shared-pass-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { ensureStudentForUser } from '../src/server/db/bookings';
import { createOrganization } from '../src/server/db/organizations';
import { addPassMember, createProduct, registerPayment, removePassMember, studentPasses, updateProduct } from '../src/server/db/payments';

const tag = `zz-shr-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
let otherOrgId = '';

const mkUser = async (label: string) => {
  const email = `${tag}-${label}@example.com`;
  const r = await auth.api.signUpEmail({ body: { email, password: 'clave-segura-123', name: `ZZ ${label}`.slice(0, 40) } });
  ids.push(r.user.id);
  return { id: r.user.id, name: `ZZ ${label}`, email };
};
const mkOrg = async (owner: string, name: string) => {
  const o = await createOrganization(owner, { name, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in o) throw new Error(o.error);
  return (o as { id: string }).id;
};
const mkStudent = async (org: string, name: string) => {
  const id = crypto.randomUUID();
  await db.insert(schema.student).values({ id, organizationId: org, name });
  return id;
};
const attend = async (org: string, svc: string, studentId: string, hoursAhead: number) => {
  const sid = crypto.randomUUID();
  await db.insert(schema.classSession).values({
    id: sid,
    organizationId: org,
    serviceId: svc,
    startsAt: new Date(Date.now() + hoursAhead * 3600e3),
    endsAt: new Date(Date.now() + (hoursAhead + 1) * 3600e3),
    capacity: 5,
    status: 'SCHEDULED',
  });
  const bid = crypto.randomUUID();
  await db.insert(schema.booking).values({ id: bid, organizationId: org, sessionId: sid, studentId, status: 'CONFIRMED', source: 'STAFF' });
  await db.insert(schema.attendance).values({ organizationId: org, sessionId: sid, bookingId: bid, studentId, status: 'PRESENT' });
};

try {
  const owner = await mkUser('owner');
  const other = await mkUser('other');
  orgId = await mkOrg(owner.id, `ZZ Shr ${tag}`);
  otherOrgId = await mkOrg(other.id, `ZZ Shr Otra ${tag}`);
  const ana = await mkStudent(orgId, 'Ana');
  const beto = await mkStudent(orgId, 'Beto');
  const carla = await mkStudent(orgId, 'Carla');
  const dani = await mkStudent(orgId, 'Dani');
  const foreign = await mkStudent(otherOrgId, 'Foránea');

  // ── Producto con lugares ────────────────────────────────────────────────────
  const solo = (await createProduct(owner.id, orgId, { name: 'Mensualidad individual', kind: 'MEMBERSHIP', priceCents: 70000, validityDays: 30 })) as { id: string };
  const pair = (await createProduct(owner.id, orgId, { name: 'Mensualidad pareja', kind: 'MEMBERSHIP', priceCents: 100000, validityDays: 30, seats: 2 })) as { id: string };
  const fam = (await createProduct(owner.id, orgId, { name: 'Familiar', kind: 'MEMBERSHIP', priceCents: 150000, validityDays: 30, seats: 3 })) as { id: string };
  const pool = (await createProduct(owner.id, orgId, { name: 'Paquete 3 compartido', kind: 'PACKAGE', priceCents: 80000, credits: 3, validityDays: 30, seats: 2 })) as { id: string };
  out.push(['Lugares inválidos (0 o más de 20) se rechazan', 'error' in (await createProduct(owner.id, orgId, { name: 'X', kind: 'MEMBERSHIP', priceCents: 1, validityDays: 30, seats: 0 })) && 'error' in (await createProduct(owner.id, orgId, { name: 'X', kind: 'MEMBERSHIP', priceCents: 1, validityDays: 30, seats: 21 }))]);
  out.push(['Se puede cambiar los lugares de un producto', 'ok' in (await updateProduct(owner.id, orgId, solo.id, { seats: 1 }))]);

  // ── Individual: sigue igual ─────────────────────────────────────────────────
  await registerPayment(owner.id, orgId, { studentId: ana, productId: solo.id, method: 'CASH' });
  let p = await studentPasses(ana);
  out.push(['Un paquete individual tiene 1 lugar y 1 persona', p.length === 1 && p[0].seats === 1 && p[0].members.length === 1 && p[0].vacant === 0]);

  // ── Pareja pagada por una persona con la otra incluida ─────────────────────
  const reg = await registerPayment(owner.id, orgId, { studentId: beto, productId: pair.id, method: 'CASH', memberStudentIds: [carla] });
  out.push(['Cobra la pareja con las dos personas', 'id' in reg && !!reg.passCreated]);
  const pb = await studentPasses(beto);
  const pc = await studentPasses(carla);
  out.push(['El titular ve el paquete con 2 personas', pb.length === 1 && pb[0].members.length === 2 && pb[0].isHolder && pb[0].vacant === 0]);
  out.push(['La otra persona también lo ve (no es titular)', pc.length === 1 && pc[0].id === pb[0].id && !pc[0].isHolder]);
  out.push(['Solo se cobró una vez', (await db.select().from(schema.payment).where(eq(schema.payment.studentId, beto))).length === 1]);

  // ── Validaciones al cobrar ──────────────────────────────────────────────────
  const tooMany = await registerPayment(owner.id, orgId, { studentId: ana, productId: pair.id, method: 'CASH', memberStudentIds: [beto, carla] });
  out.push(['Más personas que lugares se rechaza', 'error' in tooMany && tooMany.error === 'TOO_MANY_PEOPLE']);
  const foreignMember = await registerPayment(owner.id, orgId, { studentId: ana, productId: pair.id, method: 'CASH', memberStudentIds: [foreign] });
  out.push(['Una persona de otra academia se rechaza', 'error' in foreignMember && foreignMember.error === 'MEMBER_NOT_FOUND']);
  const noProduct = await registerPayment(owner.id, orgId, { studentId: ana, concept: 'Playera', amountCents: 100, method: 'CASH', memberStudentIds: [beto] });
  out.push(['Un cobro libre no se comparte', 'error' in noProduct && noProduct.error === 'MEMBERS_NEED_PRODUCT']);

  // ── Con una sola persona registrada: sumar a las demás después ─────────────
  await registerPayment(owner.id, orgId, { studentId: ana, productId: fam.id, method: 'CASH' });
  const famPass = (await studentPasses(ana)).find((x) => x.seats === 3)!;
  out.push(['Se vende solo con quien paga y quedan lugares libres', famPass.members.length === 1 && famPass.vacant === 2]);
  out.push(['Suma a una persona después', 'ok' in (await addPassMember(owner.id, orgId, famPass.id, beto))]);
  out.push(['No se repite la misma persona', ('error' in (await addPassMember(owner.id, orgId, famPass.id, beto))) && (await addPassMember(owner.id, orgId, famPass.id, beto) as { error: string }).error === 'ALREADY_IN']);
  out.push(['El titular no se suma de nuevo', (await addPassMember(owner.id, orgId, famPass.id, ana) as { error?: string }).error === 'IS_HOLDER']);
  out.push(['Una persona de otra academia no se puede sumar', (await addPassMember(owner.id, orgId, famPass.id, foreign) as { error?: string }).error === 'NOT_FOUND']);
  out.push(['Suma al tercero', 'ok' in (await addPassMember(owner.id, orgId, famPass.id, carla))]);
  out.push(['Sin lugares libres se rechaza', (await addPassMember(owner.id, orgId, famPass.id, dani) as { error?: string }).error === 'FULL']);
  out.push(['El titular no se puede quitar', (await removePassMember(owner.id, orgId, famPass.id, ana) as { error?: string }).error === 'IS_HOLDER']);
  out.push(['Quita a una persona', 'ok' in (await removePassMember(owner.id, orgId, famPass.id, carla))]);
  out.push(['Quitar a quien no está da NOT_FOUND', (await removePassMember(owner.id, orgId, famPass.id, carla) as { error?: string }).error === 'NOT_FOUND']);
  out.push(['Quien se quitó ya no ve el paquete', !(await studentPasses(carla)).some((x) => x.id === famPass.id)]);

  // ── Altas simultáneas no pasan del límite ───────────────────────────────────
  await registerPayment(owner.id, orgId, { studentId: dani, productId: pair.id, method: 'CASH' });
  const daniPair = (await studentPasses(dani))[0];
  const racers = await Promise.all([addPassMember(owner.id, orgId, daniPair.id, ana), addPassMember(owner.id, orgId, daniPair.id, carla), addPassMember(owner.id, orgId, daniPair.id, beto)]);
  out.push(['Altas simultáneas: solo entra una para 1 lugar libre', racers.filter((r) => 'ok' in r).length === 1, JSON.stringify(racers.map((r) => ('ok' in r ? 'ok' : r.error)))]);

  // ── Créditos: un fondo común ────────────────────────────────────────────────
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  const cc = await mkStudent(orgId, 'Fondo Uno');
  const dd = await mkStudent(orgId, 'Fondo Dos');
  await registerPayment(owner.id, orgId, { studentId: cc, productId: pool.id, method: 'CASH', memberStudentIds: [dd] });
  await attend(orgId, svc, cc, 1);
  await attend(orgId, svc, dd, 2);
  let shared = (await studentPasses(dd))[0];
  out.push(['La asistencia de cualquiera consume el fondo común', shared.used === 2 && shared.remaining === 1, `${shared.used}/${shared.creditsTotal}`]);
  out.push(['Cada quien ve cuánto usó', shared.members.find((m) => m.studentId === cc)?.used === 1 && shared.members.find((m) => m.studentId === dd)?.used === 1]);
  await attend(orgId, svc, dd, 3);
  await attend(orgId, svc, cc, 4); // ya no quedan créditos
  shared = (await studentPasses(cc))[0];
  out.push(['Al agotarse no se pasa del total', shared.used === 3 && shared.remaining === 0 && !shared.active, `${shared.used}/${shared.creditsTotal}`]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  for (const o of [orgId, otherOrgId].filter(Boolean)) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, o));
    await db.delete(schema.organization).where(eq(schema.organization.id, o));
  }
  if (ids.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }
  process.exit(process.exitCode ?? 0);
}
