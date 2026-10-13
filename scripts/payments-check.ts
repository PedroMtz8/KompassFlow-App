/**
 * Prueba de punta a punta (servicios) de productos, cobros, pases, transferencias y corte de caja.
 * Crea datos temporales y los borra:  bun --env-file=.env scripts/payments-check.ts
 */
import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';
import { ensureStudentForUser } from '../src/server/db/bookings';
import {
  cashPreview,
  closeCash,
  createProduct,
  listProducts,
  myMembership,
  notifyTransfer,
  paymentsSummary,
  publicProducts,
  registerPayment,
  requestTransfer,
  resolveTransfer,
  savePaymentSettings,
  studentPasses,
} from '../src/server/db/payments';

const tag = `zz-pay-${Date.now()}`;
const out: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => out.push({ name, ok, detail });
const userIds: string[] = [];
let orgId = '';

const mkUser = async (label: string) => {
  const email = `${tag}-${label}@example.com`;
  const r = await auth.api.signUpEmail({ body: { email, password: 'clave-segura-123', name: `ZZ ${label}` } });
  userIds.push(r.user.id);
  return { id: r.user.id, name: `ZZ ${label}`, email };
};

try {
  const owner = await mkUser('owner');
  const alumna = await mkUser('alumna');
  const org = await createOrganization(owner.id, {
    name: `ZZ Pay ${tag}`,
    type: 'STUDIO',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Tepic',
    roomName: 'Sala',
    roomCapacity: 20,
  } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;
  await db.update(schema.organizationDetail).set({ isPublished: true }).where(eq(schema.organizationDetail.organizationId, orgId));

  // Productos.
  const bad = await createProduct(owner.id, orgId, { name: 'Paquete', kind: 'PACKAGE', priceCents: 100000 });
  check('Paquete sin créditos se rechaza', 'error' in bad && bad.error === 'CREDITS_REQUIRED');
  const pkg = (await createProduct(owner.id, orgId, {
    name: 'Paquete 3 clases',
    kind: 'PACKAGE',
    priceCents: 45000,
    credits: 3,
    validityDays: 30,
  })) as { id: string };
  const single = (await createProduct(owner.id, orgId, { name: 'Clase suelta', kind: 'SINGLE', priceCents: 15000 })) as { id: string };
  const members = (await createProduct(owner.id, orgId, {
    name: 'Mensualidad',
    kind: 'MEMBERSHIP',
    priceCents: 90000,
    validityDays: 30,
    isVisible: false,
  })) as { id: string };
  const list = await listProducts(orgId);
  check('Productos creados', list.length === 3, `${list.length}`);

  // Cobro manual con pase.
  const student = await ensureStudentForUser(orgId, alumna);
  const reg = await registerPayment(owner.id, orgId, { studentId: student, productId: pkg.id, method: 'CASH' });
  check('Cobro en efectivo crea pase', 'id' in reg && !!reg.passCreated);
  const free = await registerPayment(owner.id, orgId, { studentId: student, concept: 'Playera', amountCents: 20000, method: 'OTHER' });
  check('Cobro libre sin pase', 'id' in free && !free.passCreated);
  check(
    'Cobro sin concepto ni producto se rechaza',
    'error' in (await registerPayment(owner.id, orgId, { studentId: student, method: 'CASH', amountCents: 1 }))
  );
  check(
    'Alumno de otra organización se rechaza',
    'error' in (await registerPayment(owner.id, orgId, { studentId: 'no-existe', concept: 'x', amountCents: 1, method: 'CASH' }))
  );

  // Créditos derivados de la asistencia.
  let passes = await studentPasses(student);
  check(
    'Pase con 3 créditos',
    passes.length === 1 && passes[0].remaining === 3,
    JSON.stringify(passes.map((p) => [p.creditsTotal, p.remaining]))
  );
  const svc = crypto.randomUUID();
  await db.insert(schema.service).values({ id: svc, organizationId: orgId, name: 'ZZ', kind: 'GROUP', priceCents: 0, durationMin: 60 });
  for (let i = 0; i < 2; i++) {
    const sid = crypto.randomUUID();
    await db.insert(schema.classSession).values({
      id: sid,
      organizationId: orgId,
      serviceId: svc,
      startsAt: new Date(Date.now() + (i + 1) * 3600e3),
      endsAt: new Date(Date.now() + (i + 2) * 3600e3),
      capacity: 5,
      status: 'SCHEDULED',
    });
    const bid = crypto.randomUUID();
    await db
      .insert(schema.booking)
      .values({ id: bid, organizationId: orgId, sessionId: sid, studentId: student, status: 'CONFIRMED', source: 'STAFF' });
    await db
      .insert(schema.attendance)
      .values({ organizationId: orgId, sessionId: sid, bookingId: bid, studentId: student, status: 'PRESENT' });
  }
  passes = await studentPasses(student);
  check(
    'Dos asistencias consumen 2 créditos',
    passes[0].used === 2 && passes[0].remaining === 1,
    `usados=${passes[0].used} quedan=${passes[0].remaining}`
  );

  // Transferencias.
  check(
    'Transferencia sin datos bancarios se rechaza',
    (await requestTransfer(alumna, pkg.id)).error === ('TRANSFER_NOT_ACCEPTED' as never)
  );
  check(
    'CLABE inválida se rechaza',
    'error' in (await savePaymentSettings(owner.id, orgId, { acceptsCash: true, acceptsTransfer: true, clabe: '123', beneficiary: 'X' }))
  );
  await savePaymentSettings(owner.id, orgId, {
    acceptsCash: true,
    acceptsTransfer: true,
    bank: 'BBVA',
    clabe: '012 180 0152 4412 3456',
    beneficiary: 'ZZ Academia',
  });
  const pub = await publicProducts(orgId);
  check(
    'Perfil público oculta productos no visibles',
    !!pub && pub.products.length === 2 && pub.acceptsTransfer,
    `${pub?.products.length}`
  );
  const t1 = await requestTransfer(alumna, single.id);
  const t2 = await requestTransfer(alumna, single.id);
  check(
    'Misma transferencia pendiente se reutiliza',
    'id' in t1 && 'id' in t2 && t1.id === t2.id && t1.reference === t2.reference,
    'id' in t1 ? t1.reference : ''
  );
  check('Producto oculto no se puede pedir', (await requestTransfer(alumna, members.id)).error === ('NOT_FOUND' as never));
  if (!('id' in t1)) throw new Error('sin transferencia: ' + JSON.stringify(t1));
  check('Aviso con clave de rastreo', 'ok' in (await notifyTransfer(alumna.id, t1.id, 'MBAN0100123')));
  const sum1 = await paymentsSummary(orgId);
  check('Resumen lista la transferencia pendiente', sum1.pending.length === 1 && sum1.pending[0].trackingKey === 'MBAN0100123');
  // Tres confirmaciones simultáneas: solo una gana. (El rechazo se prueba aparte: si compitiera, podría ganar él y el resto
  // del escenario cambiaría de forma aleatoria.)
  const racers = await Promise.all([
    resolveTransfer(owner.id, orgId, t1.id, 'confirm'),
    resolveTransfer(owner.id, orgId, t1.id, 'confirm'),
    resolveTransfer(owner.id, orgId, t1.id, 'confirm'),
  ]);
  const wins = racers.filter((r) => 'ok' in r).length;
  const passCount = (await db.select().from(schema.studentPass).where(eq(schema.studentPass.studentId, student))).length;
  check(
    'Confirmar a la vez: solo una resolución gana y un solo pase',
    wins === 1 && passCount === 2,
    `ganadoras=${wins}, pases=${passCount}`
  );

  // Resumen y caja.
  const sum = await paymentsSummary(orgId);
  const expected = 45000 + 20000 + 15000;
  check('Total del mes suma lo cobrado', sum.totalCents === expected, `${sum.totalCents} vs ${expected}`);
  check(
    'Desglose por método',
    sum.byMethod.find((m) => m.method === 'CASH')?.amountCents === 45000 &&
      sum.byMethod.find((m) => m.method === 'TRANSFER')?.amountCents === 15000
  );
  const cash = await cashPreview(orgId);
  check('Caja espera solo efectivo', cash.expectedCents === 45000 && cash.lines.length === 1, `${cash.expectedCents}`);
  const closed = await closeCash(owner.id, orgId, 44000, 'faltan 10');
  check('Corte registra diferencia', 'differenceCents' in closed && closed.differenceCents === -1000);
  check('Después del corte la caja queda en cero', (await cashPreview(orgId)).expectedCents === 0);
  check('Cerrar sin nada se rechaza', (await closeCash(owner.id, orgId, 0)).error === ('NOTHING_TO_CLOSE' as never));

  const mine = await myMembership(alumna.id);
  check(
    'Mis pases y pagos',
    mine.passes.length === 2 && mine.payments.length >= 3,
    `${mine.passes.length} pases, ${mine.payments.length} pagos`
  );

  for (const r of out) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (out.some((r) => !r.ok)) process.exitCode = 1;
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
