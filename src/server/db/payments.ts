import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { env } from '../env';
import { isUniqueViolation } from '../lib/db-errors';
import { addDays, localDate, zonedTimeToUtc } from '../lib/time';
import { ensureStudentForUser } from './bookings';
import { db, schema } from './index';
import { membersWith, money, notifyMany, notifyStudent } from './notifications';
import { auditStatement } from './organizations';

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

const clean = (v: string | undefined | null) => {
  const t = v?.trim();
  return t ? t : null;
};

async function orgTz(organizationId: string) {
  const d = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  return { timezone: d?.timezone ?? 'America/Mazatlan', currency: d?.currency ?? 'MXN' };
}

/* ── Productos ────────────────────────────────────────────────────────────── */

export type ProductInput = {
  name: string;
  description?: string;
  kind: 'SINGLE' | 'PACKAGE' | 'MEMBERSHIP';
  priceCents: number;
  credits?: number;
  validityDays?: number;
  /** Personas que comparten el paquete (por defecto 1). El precio es del paquete completo. */
  seats?: number;
  isVisible?: boolean;
};

export const MAX_SEATS = 20;

/** Créditos que da cada tipo: SINGLE = 1, PACKAGE = N (obligatorio), MEMBERSHIP = ilimitado. */
function normalizeProduct(input: ProductInput) {
  if (input.seats != null && !(Number.isInteger(input.seats) && input.seats >= 1 && input.seats <= MAX_SEATS)) return { error: 'SEATS_INVALID' as const };
  if (input.kind === 'PACKAGE' && !(input.credits && input.credits >= 1)) return { error: 'CREDITS_REQUIRED' as const };
  if (input.kind === 'MEMBERSHIP' && !(input.validityDays && input.validityDays >= 1)) return { error: 'VALIDITY_REQUIRED' as const };
  return {
    credits: input.kind === 'SINGLE' ? 1 : input.kind === 'PACKAGE' ? input.credits! : null,
    validityDays: input.validityDays ?? null,
    seats: input.seats ?? 1,
  };
}

export async function listProducts(organizationId: string, opts: { onlyVisible?: boolean } = {}) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      description: schema.product.description,
      kind: schema.product.kind,
      priceCents: schema.product.priceCents,
      credits: schema.product.credits,
      validityDays: schema.product.validityDays,
      seats: schema.product.seats,
      isVisible: schema.product.isVisible,
      isActive: schema.product.isActive,
      activePasses: sql<number>`(select count(*) from student_pass p where p.product_id = product.id and (p.expires_at is null or p.expires_at > ${now.getTime()}))`,
      soldThisMonth: sql<number>`(select count(*) from payment y where y.product_id = product.id and y.status = 'PAID' and y.paid_at >= ${monthStart.getTime()})`,
    })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, organizationId),
        opts.onlyVisible ? and(eq(schema.product.isActive, true), eq(schema.product.isVisible, true)) : undefined
      )
    )
    .orderBy(desc(schema.product.isActive), asc(schema.product.priceCents));
  return rows;
}

export async function createProduct(actorId: string, organizationId: string, input: ProductInput) {
  const n = normalizeProduct(input);
  if ('error' in n) return n;
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(schema.product).values({
      id,
      organizationId,
      name: input.name.trim(),
      description: clean(input.description),
      kind: input.kind,
      priceCents: input.priceCents,
      credits: n.credits,
      validityDays: n.validityDays,
      seats: n.seats,
      isVisible: input.isVisible ?? true,
    }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'product.created',
      entityType: 'product',
      entityId: id,
      metadata: { name: input.name, priceCents: input.priceCents },
    }),
  ] as Batch);
  return { id };
}

export async function updateProduct(
  actorId: string,
  organizationId: string,
  productId: string,
  input: Partial<ProductInput> & { isActive?: boolean }
) {
  const p = await db.query.product.findFirst({
    where: and(eq(schema.product.id, productId), eq(schema.product.organizationId, organizationId)),
  });
  if (!p) return { error: 'NOT_FOUND' as const };
  const set: Partial<typeof schema.product.$inferInsert> = {};
  if (input.name?.trim()) set.name = input.name.trim();
  if (input.description !== undefined) set.description = clean(input.description);
  if (input.priceCents !== undefined) set.priceCents = input.priceCents;
  if (input.isVisible !== undefined) set.isVisible = input.isVisible;
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.validityDays !== undefined) set.validityDays = input.validityDays;
  if (input.seats !== undefined) {
    if (!(Number.isInteger(input.seats) && input.seats >= 1 && input.seats <= MAX_SEATS)) return { error: 'SEATS_INVALID' as const };
    set.seats = input.seats;
  }
  if (input.credits !== undefined && p.kind === 'PACKAGE') set.credits = input.credits;
  if (!Object.keys(set).length) return { ok: true as const };
  await db.batch([
    db.update(schema.product).set(set).where(eq(schema.product.id, productId)),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'product.updated',
      entityType: 'product',
      entityId: productId,
      metadata: input,
    }),
  ] as Batch);
  return { ok: true as const };
}

/* ── Datos de cobro ───────────────────────────────────────────────────────── */

export async function getPaymentSettings(organizationId: string) {
  const s = await db.query.paymentSettings.findFirst({ where: eq(schema.paymentSettings.organizationId, organizationId) });
  return {
    acceptsCash: s?.acceptsCash ?? true,
    acceptsTransfer: s?.acceptsTransfer ?? false,
    // Cuenta de cobro con tarjeta lista para recibir (se vuelve a verificar con Stripe al cobrar).
    cardReady: !!env.stripe && !!s?.stripeChargesEnabled,
    bank: s?.bank ?? '',
    clabe: s?.clabe ?? '',
    beneficiary: s?.beneficiary ?? '',
  };
}

export type PaymentSettingsInput = { acceptsCash: boolean; acceptsTransfer: boolean; bank?: string; clabe?: string; beneficiary?: string };

export async function savePaymentSettings(actorId: string, organizationId: string, input: PaymentSettingsInput) {
  const clabe = (input.clabe ?? '').replace(/\s/g, '');
  if (input.acceptsTransfer) {
    if (!/^\d{18}$/.test(clabe)) return { error: 'INVALID_CLABE' as const };
    if (!clean(input.beneficiary)) return { error: 'BENEFICIARY_REQUIRED' as const };
  }
  const values = {
    organizationId,
    acceptsCash: input.acceptsCash,
    acceptsTransfer: input.acceptsTransfer,
    bank: clean(input.bank),
    clabe: clabe || null,
    beneficiary: clean(input.beneficiary),
  };
  await db.batch([
    db.insert(schema.paymentSettings).values(values).onConflictDoUpdate({ target: schema.paymentSettings.organizationId, set: values }),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'payment_settings.updated',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { acceptsCash: input.acceptsCash, acceptsTransfer: input.acceptsTransfer },
    }),
  ] as Batch);
  return { ok: true as const };
}

/* ── Pagos ────────────────────────────────────────────────────────────────── */

/** Sentencia que crea el pase que corresponde a un producto pagado (o `null` si no es un producto). */
export function passStatement(p: {
  id?: string;
  organizationId: string;
  studentId: string;
  paymentId: string;
  product: typeof schema.product.$inferSelect | null;
  paidAt: Date;
}) {
  if (!p.product) return null;
  const expiresAt = p.product.validityDays ? new Date(p.paidAt.getTime() + p.product.validityDays * 24 * 3600_000) : null;
  return db
    .insert(schema.studentPass)
    .values({
      id: p.id ?? crypto.randomUUID(),
      organizationId: p.organizationId,
      studentId: p.studentId,
      productId: p.product.id,
      paymentId: p.paymentId,
      name: p.product.name,
      seats: p.product.seats,
      creditsTotal: p.product.credits,
      startsAt: p.paidAt,
      expiresAt,
    })
    .onConflictDoNothing();
}

export type RegisterPaymentInput = {
  studentId: string;
  productId?: string;
  concept?: string;
  amountCents?: number;
  method: 'CASH' | 'TRANSFER' | 'OTHER';
  reference?: string;
  note?: string;
  /** Otras personas que comparten el paquete (además de quien paga). Opcional: se pueden sumar después. */
  memberStudentIds?: string[];
};

/** Cobro manual registrado por el personal: queda pagado al instante y, si es un producto, crea el pase. */
export async function registerPayment(actorId: string, organizationId: string, input: RegisterPaymentInput) {
  const student = await db.query.student.findFirst({
    where: and(eq(schema.student.id, input.studentId), eq(schema.student.organizationId, organizationId)),
  });
  if (!student) return { error: 'STUDENT_NOT_FOUND' as const };
  const product = input.productId
    ? ((await db.query.product.findFirst({
        where: and(
          eq(schema.product.id, input.productId),
          eq(schema.product.organizationId, organizationId),
          eq(schema.product.isActive, true)
        ),
      })) ?? null)
    : null;
  if (input.productId && !product) return { error: 'PRODUCT_NOT_FOUND' as const };
  const concept = product?.name ?? clean(input.concept);
  if (!concept) return { error: 'CONCEPT_REQUIRED' as const };
  const amountCents = input.amountCents ?? product?.priceCents;
  if (amountCents == null || amountCents < 0) return { error: 'AMOUNT_REQUIRED' as const };

  const id = crypto.randomUUID();
  const paidAt = new Date();
  const passId = crypto.randomUUID();
  const pass = passStatement({ id: passId, organizationId, studentId: student.id, paymentId: id, product, paidAt });

  // Personas que comparten el paquete: sin repetir, de esta academia, sin pasarse de los lugares del producto.
  const memberIds = [...new Set(input.memberStudentIds ?? [])].filter((m) => m !== student.id);
  if (memberIds.length && !product) return { error: 'MEMBERS_NEED_PRODUCT' as const };
  if (product && memberIds.length > product.seats - 1) return { error: 'TOO_MANY_PEOPLE' as const };
  if (memberIds.length) {
    const found = await db
      .select({ id: schema.student.id })
      .from(schema.student)
      .where(and(eq(schema.student.organizationId, organizationId), inArray(schema.student.id, memberIds)));
    if (found.length !== memberIds.length) return { error: 'MEMBER_NOT_FOUND' as const };
  }
  try {
    await db.batch([
      db.insert(schema.payment).values({
        id,
        organizationId,
        studentId: student.id,
        productId: product?.id ?? null,
        concept,
        amountCents,
        method: input.method,
        status: 'PAID',
        reference: clean(input.reference),
        note: clean(input.note),
        createdBy: actorId,
        confirmedBy: actorId,
        paidAt,
      }),
      ...(pass ? [pass] : []),
      ...(pass && memberIds.length
        ? [db.insert(schema.passMember).values(memberIds.map((studentId) => ({ passId, studentId, organizationId, addedBy: actorId })))]
        : []),
      auditStatement({
        organizationId,
        actorUserId: actorId,
        action: 'payment.registered',
        entityType: 'payment',
        entityId: id,
        metadata: { studentId: student.id, amountCents, method: input.method, concept, members: memberIds.length || undefined },
      }),
    ] as Batch);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'DUPLICATE_REFERENCE' as const };
    throw e;
  }
  const { currency } = await orgTz(organizationId);
  await notifyStudent(student.id, actorId, {
    category: 'payment',
    organizationId,
    title: 'Se registró tu pago',
    body: `${concept} · ${money(amountCents, currency)}${pass ? '. Tu paquete ya está activo.' : ''}`,
    url: '/membership',
  });
  return { id, passCreated: !!pass };
}

/** Confirma (o rechaza) una transferencia avisada por el alumno. Solo actúa si sigue pendiente. */
export async function resolveTransfer(actorId: string, organizationId: string, paymentId: string, decision: 'confirm' | 'reject') {
  const pay = await db.query.payment.findFirst({
    where: and(eq(schema.payment.id, paymentId), eq(schema.payment.organizationId, organizationId)),
  });
  if (!pay) return { error: 'NOT_FOUND' as const };
  if (pay.status !== 'PENDING') return { error: 'NOT_PENDING' as const };
  const paidAt = new Date();
  const claimed = await db
    .update(schema.payment)
    .set(decision === 'confirm' ? { status: 'PAID', paidAt, confirmedBy: actorId } : { status: 'REJECTED', confirmedBy: actorId })
    .where(and(eq(schema.payment.id, paymentId), eq(schema.payment.status, 'PENDING')))
    .returning({ id: schema.payment.id });
  if (!claimed.length) return { error: 'NOT_PENDING' as const };
  const statements: BatchItem<'sqlite'>[] = [];
  if (decision === 'confirm') {
    const product = pay.productId ? ((await db.query.product.findFirst({ where: eq(schema.product.id, pay.productId) })) ?? null) : null;
    const pass = passStatement({ organizationId, studentId: pay.studentId, paymentId, product, paidAt });
    if (pass) statements.push(pass);
  }
  statements.push(
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: decision === 'confirm' ? 'payment.confirmed' : 'payment.rejected',
      entityType: 'payment',
      entityId: paymentId,
      metadata: { amountCents: pay.amountCents },
    })
  );
  await db.batch(statements as Batch);
  const { currency } = await orgTz(organizationId);
  await notifyStudent(
    pay.studentId,
    actorId,
    decision === 'confirm'
      ? { category: 'payment', organizationId, title: 'Pago confirmado', body: `${pay.concept} · ${money(pay.amountCents, currency)}. Tu paquete ya está activo.`, url: '/membership' }
      : { category: 'payment', organizationId, title: 'No encontramos tu transferencia', body: `${pay.concept}: revisa la clave de rastreo o habla con la academia.`, url: '/membership' }
  );
  return { ok: true as const };
}

/** Resumen del mes para la pantalla de Pagos. `month` = "YYYY-MM" en la zona de la organización. */
export async function paymentsSummary(organizationId: string, month?: string) {
  const { timezone, currency } = await orgTz(organizationId);
  const today = localDate(Date.now(), timezone);
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : today.slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  const prevMonth = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  const start = zonedTimeToUtc(`${m}-01`, '00:00', timezone);
  const end = zonedTimeToUtc(`${nextMonth}-01`, '00:00', timezone);
  const prevStart = zonedTimeToUtc(`${prevMonth}-01`, '00:00', timezone);

  const [paid, prev, pending, cash] = await Promise.all([
    db
      .select({ amountCents: schema.payment.amountCents, method: schema.payment.method, paidAt: schema.payment.paidAt })
      .from(schema.payment)
      .where(
        and(
          eq(schema.payment.organizationId, organizationId),
          eq(schema.payment.status, 'PAID'),
          gte(schema.payment.paidAt, new Date(start)),
          lt(schema.payment.paidAt, new Date(end))
        )
      )
      .limit(5000),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.payment.amountCents}), 0)` })
      .from(schema.payment)
      .where(
        and(
          eq(schema.payment.organizationId, organizationId),
          eq(schema.payment.status, 'PAID'),
          gte(schema.payment.paidAt, new Date(prevStart)),
          lt(schema.payment.paidAt, new Date(start))
        )
      ),
    db
      .select({
        id: schema.payment.id,
        amountCents: schema.payment.amountCents,
        concept: schema.payment.concept,
        reference: schema.payment.reference,
        trackingKey: schema.payment.trackingKey,
        createdAt: schema.payment.createdAt,
        studentName: schema.student.name,
        studentImage: schema.user.image,
      })
      .from(schema.payment)
      .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
      .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
      .where(and(eq(schema.payment.organizationId, organizationId), eq(schema.payment.status, 'PENDING')))
      .orderBy(asc(schema.payment.createdAt))
      .limit(50),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.payment.amountCents}), 0)` })
      .from(schema.payment)
      .where(
        and(
          eq(schema.payment.organizationId, organizationId),
          eq(schema.payment.method, 'CASH'),
          eq(schema.payment.status, 'PAID'),
          isNull(schema.payment.cashCloseId)
        )
      ),
  ]);

  const total = paid.reduce((a, p) => a + p.amountCents, 0);
  const byMethod = (['CASH', 'TRANSFER', 'CARD', 'OTHER'] as const).map((method) => {
    const amountCents = paid.filter((p) => p.method === method).reduce((a, p) => a + p.amountCents, 0);
    return { method, amountCents, share: total ? amountCents / total : 0 };
  });
  // Barras: ingreso por día del mes (en la zona de la organización).
  const days = Math.round((end - start) / (24 * 3600_000));
  const perDay = new Map<string, number>();
  for (const p of paid) {
    const d = localDate(p.paidAt!.getTime(), timezone);
    perDay.set(d, (perDay.get(d) ?? 0) + p.amountCents);
  }
  const byDay = Array.from({ length: days }, (_, i) => {
    const d = addDays(`${m}-01`, i);
    return { date: d, amountCents: perDay.get(d) ?? 0 };
  });
  const prevTotal = Number(prev[0]?.total ?? 0);
  return {
    month: m,
    currency,
    totalCents: total,
    previousCents: prevTotal,
    deltaPct: prevTotal ? (total - prevTotal) / prevTotal : null,
    count: paid.length,
    byMethod,
    byDay,
    pending,
    cashPendingCents: Number(cash[0]?.total ?? 0),
  };
}

/** Pagos recientes (para historial de una persona o de la academia). */
/**
 * Lista de pagos de la academia, del más reciente al más antiguo. `q` busca por alumno, concepto (la clase o el paquete cobrado) o referencia
 * en todo el historial; sin `q`, `month` (`YYYY-MM`) acota a ese mes. Con paginación estable (`offset`/`limit`).
 */
export async function listPayments(
  organizationId: string,
  opts: { studentId?: string; limit?: number; offset?: number; q?: string; month?: string } = {}
) {
  const term = opts.q?.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  let range: ReturnType<typeof and> | undefined;
  if (!term && opts.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.month)) {
    const { timezone } = await orgTz(organizationId);
    const [y, mo] = opts.month.split('-').map(Number);
    const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const when = sql`coalesce(${schema.payment.paidAt}, ${schema.payment.createdAt})`;
    range = and(
      sql`${when} >= ${zonedTimeToUtc(`${opts.month}-01`, '00:00', timezone)}`,
      sql`${when} < ${zonedTimeToUtc(`${next}-01`, '00:00', timezone)}`
    );
  }
  return db
    .select({
      id: schema.payment.id,
      concept: schema.payment.concept,
      amountCents: schema.payment.amountCents,
      method: schema.payment.method,
      status: schema.payment.status,
      reference: schema.payment.reference,
      paidAt: schema.payment.paidAt,
      createdAt: schema.payment.createdAt,
      studentId: schema.payment.studentId,
      studentName: schema.student.name,
      studentImage: schema.user.image,
    })
    .from(schema.payment)
    .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
    .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
    .where(
      and(
        eq(schema.payment.organizationId, organizationId),
        opts.studentId ? eq(schema.payment.studentId, opts.studentId) : undefined,
        term
          ? sql`(lower(${schema.student.name}) like ${`%${term}%`} escape '\\' or lower(${schema.payment.concept}) like ${`%${term}%`} escape '\\' or lower(coalesce(${schema.payment.reference}, '')) like ${`%${term}%`} escape '\\')`
          : undefined,
        range
      )
    )
    .orderBy(desc(schema.payment.createdAt), desc(schema.payment.id))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
}

/* ── Corte de caja ────────────────────────────────────────────────────────── */

export async function cashPreview(organizationId: string) {
  const { currency } = await orgTz(organizationId);
  const lines = await db
    .select({
      id: schema.payment.id,
      concept: schema.payment.concept,
      amountCents: schema.payment.amountCents,
      paidAt: schema.payment.paidAt,
      studentName: schema.student.name,
    })
    .from(schema.payment)
    .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
    .where(
      and(
        eq(schema.payment.organizationId, organizationId),
        eq(schema.payment.method, 'CASH'),
        eq(schema.payment.status, 'PAID'),
        isNull(schema.payment.cashCloseId)
      )
    )
    .orderBy(asc(schema.payment.paidAt))
    .limit(500);
  const last = await db.query.cashClose.findFirst({
    where: eq(schema.cashClose.organizationId, organizationId),
    orderBy: desc(schema.cashClose.closedAt),
  });
  return {
    currency,
    expectedCents: lines.reduce((a, l) => a + l.amountCents, 0),
    lines,
    lastClose: last ? { closedAt: last.closedAt, expectedCents: last.expectedCents, countedCents: last.countedCents } : null,
  };
}

export async function closeCash(actorId: string, organizationId: string, countedCents: number, note?: string) {
  const preview = await cashPreview(organizationId);
  if (!preview.lines.length && countedCents === 0) return { error: 'NOTHING_TO_CLOSE' as const };
  const id = crypto.randomUUID();
  const ids = preview.lines.map((l) => l.id);
  await db.batch([
    db
      .insert(schema.cashClose)
      .values({ id, organizationId, expectedCents: preview.expectedCents, countedCents, note: clean(note), closedBy: actorId }),
    ...(ids.length
      ? [
          db
            .update(schema.payment)
            .set({ cashCloseId: id })
            .where(and(inArray(schema.payment.id, ids), isNull(schema.payment.cashCloseId))),
        ]
      : []),
    auditStatement({
      organizationId,
      actorUserId: actorId,
      action: 'cash.closed',
      entityType: 'cash_close',
      entityId: id,
      metadata: { expectedCents: preview.expectedCents, countedCents, difference: countedCents - preview.expectedCents },
    }),
  ] as Batch);
  return { id, expectedCents: preview.expectedCents, countedCents, differenceCents: countedCents - preview.expectedCents };
}

/* ── Pases (créditos y membresías) ────────────────────────────────────────── */

type PassRow = typeof schema.studentPass.$inferSelect;

/** Una asistencia (presente) de alguien con acceso a los pases. */
type Attended = { studentId: string; at: number };

/**
 * Reparte las asistencias entre los pases: cada clase asistida consume un crédito del pase vigente más antiguo que la
 * cubra y al que esa persona tenga acceso (el titular y quienes lo comparten). Los pases ilimitados no se agotan.
 * Devuelve cuántas clases consumió cada persona en cada pase.
 */
function allocate(passes: PassRow[], attended: Attended[], access: (passId: string, studentId: string) => boolean) {
  const sorted = [...passes].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const used = new Map<string, number>(sorted.map((p) => [p.id, 0]));
  const byPerson = new Map<string, Map<string, number>>(sorted.map((p) => [p.id, new Map()]));
  for (const ev of [...attended].sort((a, b) => a.at - b.at)) {
    const p = sorted.find(
      (x) =>
        access(x.id, ev.studentId) &&
        x.startsAt.getTime() <= ev.at &&
        (!x.expiresAt || ev.at <= x.expiresAt.getTime()) &&
        (x.creditsTotal == null || used.get(x.id)! < x.creditsTotal)
    );
    if (!p) continue;
    used.set(p.id, used.get(p.id)! + 1);
    const per = byPerson.get(p.id)!;
    per.set(ev.studentId, (per.get(ev.studentId) ?? 0) + 1);
  }
  return { sorted, used, byPerson };
}

function summarize(p: PassRow, used: number, now: number) {
  const expired = !!p.expiresAt && p.expiresAt.getTime() < now;
  const remaining = p.creditsTotal == null ? null : Math.max(p.creditsTotal - used, 0);
  return {
    id: p.id,
    name: p.name,
    creditsTotal: p.creditsTotal,
    used,
    remaining,
    startsAt: p.startsAt,
    expiresAt: p.expiresAt,
    daysLeft: p.expiresAt && !expired ? Math.ceil((p.expiresAt.getTime() - now) / (24 * 3600_000)) : null,
    active: !expired && (remaining == null || remaining > 0),
  };
}

/** Pases de UNA persona (sin compartir). Se conserva para pruebas y cálculos simples. */
export function allocateCredits(passes: PassRow[], attendedAt: number[], now = Date.now()) {
  const { sorted, used } = allocate(passes, attendedAt.map((at) => ({ studentId: '_', at })), () => true);
  return sorted.map((p) => summarize(p, used.get(p.id)!, now));
}

/**
 * Pases a los que tiene acceso una persona (como titular o compartidos), con los créditos ya repartidos. Como una
 * asistencia puede consumir de un pase compartido, se calculan juntos todos los pases conectados por personas en común.
 */
export async function studentPasses(studentId: string) {
  const people = new Set<string>([studentId]);
  const passIds = new Set<string>();
  // Se amplía el conjunto hasta que no aparezcan más personas ni pases (rara vez pasa de una vuelta).
  for (let i = 0; i < 6; i++) {
    const ids = [...people];
    const [held, shared] = await Promise.all([
      db.select({ id: schema.studentPass.id, holder: schema.studentPass.studentId }).from(schema.studentPass).where(inArray(schema.studentPass.studentId, ids)),
      db
        .select({ id: schema.passMember.passId, holder: schema.studentPass.studentId })
        .from(schema.passMember)
        .innerJoin(schema.studentPass, eq(schema.studentPass.id, schema.passMember.passId))
        .where(inArray(schema.passMember.studentId, ids)),
    ]);
    const before = people.size + passIds.size;
    for (const r of [...held, ...shared]) {
      passIds.add(r.id);
      people.add(r.holder);
    }
    if (passIds.size) {
      const members = await db.select({ studentId: schema.passMember.studentId }).from(schema.passMember).where(inArray(schema.passMember.passId, [...passIds]));
      for (const m of members) people.add(m.studentId);
    }
    if (people.size + passIds.size === before) break;
  }
  if (!passIds.size) return [];

  const passes = await db.select().from(schema.studentPass).where(inArray(schema.studentPass.id, [...passIds]));
  const memberRows = await db
    .select({ passId: schema.passMember.passId, studentId: schema.passMember.studentId })
    .from(schema.passMember)
    .where(inArray(schema.passMember.passId, [...passIds]));
  const accessSet = new Map<string, Set<string>>(passes.map((p) => [p.id, new Set([p.studentId])]));
  for (const m of memberRows) accessSet.get(m.passId)?.add(m.studentId);

  const attendedRows = await db
    .select({ studentId: schema.attendance.studentId, at: schema.classSession.startsAt })
    .from(schema.attendance)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.attendance.sessionId))
    .where(and(inArray(schema.attendance.studentId, [...people]), eq(schema.attendance.status, 'PRESENT')));
  const { sorted, used, byPerson } = allocate(
    passes,
    attendedRows.map((r) => ({ studentId: r.studentId, at: r.at.getTime() })),
    (passId, sid) => accessSet.get(passId)?.has(sid) ?? false
  );

  const names = new Map(
    (
      await db
        .select({ id: schema.student.id, name: schema.student.name, userId: schema.student.userId, image: schema.user.image })
        .from(schema.student)
        .leftJoin(schema.user, eq(schema.user.id, schema.student.userId))
        .where(inArray(schema.student.id, [...people]))
    ).map(
      (r) => [r.id, r]
    )
  );
  const now = Date.now();
  return sorted
    .filter((p) => accessSet.get(p.id)!.has(studentId))
    .map((p) => {
      const ids = [...accessSet.get(p.id)!];
      const members = ids.map((id) => ({
        studentId: id,
        name: names.get(id)?.name ?? 'Alumno',
        hasAccount: !!names.get(id)?.userId,
        image: names.get(id)?.image ?? null,
        isHolder: id === p.studentId,
        used: byPerson.get(p.id)?.get(id) ?? 0,
      }));
      return {
        ...summarize(p, used.get(p.id)!, now),
        productId: p.productId,
        seats: p.seats,
        holderId: p.studentId,
        isHolder: p.studentId === studentId,
        vacant: Math.max(p.seats - ids.length, 0),
        members: members.sort((a, b) => Number(b.isHolder) - Number(a.isHolder) || a.name.localeCompare(b.name)),
      };
    })
    .reverse();
}

export type PassMemberFail = 'NOT_FOUND' | 'FULL' | 'ALREADY_IN' | 'IS_HOLDER' | 'EXPIRED';

/** Suma a una persona al paquete compartido (si quedan lugares). No necesita cuenta: basta su registro de alumno. */
export async function addPassMember(actorId: string, organizationId: string, passId: string, studentId: string) {
  const pass = await db.query.studentPass.findFirst({
    where: and(eq(schema.studentPass.id, passId), eq(schema.studentPass.organizationId, organizationId)),
  });
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.id, studentId), eq(schema.student.organizationId, organizationId)),
  });
  if (!pass || !st) return { error: 'NOT_FOUND' as const };
  if (pass.studentId === studentId) return { error: 'IS_HOLDER' as const };
  if (pass.expiresAt && pass.expiresAt.getTime() < Date.now()) return { error: 'EXPIRED' as const };
  const current = await db.select({ studentId: schema.passMember.studentId }).from(schema.passMember).where(eq(schema.passMember.passId, passId));
  if (current.some((m) => m.studentId === studentId)) return { error: 'ALREADY_IN' as const };
  // Los lugares se vuelven a contar en la MISMA sentencia que inserta: dos altas simultáneas no pasan del límite.
  const res = await db.run(sql`
    INSERT INTO pass_member (pass_id, student_id, organization_id, added_by, added_at)
    SELECT ${passId}, ${studentId}, ${organizationId}, ${actorId}, ${Date.now()}
    WHERE (SELECT count(*) FROM pass_member WHERE pass_id = ${passId}) + 1 < (SELECT seats FROM student_pass WHERE id = ${passId})`);
  if (!res.rowsAffected) return { error: 'FULL' as const };
  await auditStatement({
    organizationId,
    actorUserId: actorId,
    action: 'pass.member_added',
    entityType: 'student_pass',
    entityId: passId,
    metadata: { studentId },
  });
  return { ok: true as const };
}

/** Quita a una persona del paquete. Su historial de asistencias se conserva; el titular no se puede quitar. */
export async function removePassMember(actorId: string, organizationId: string, passId: string, studentId: string) {
  const pass = await db.query.studentPass.findFirst({
    where: and(eq(schema.studentPass.id, passId), eq(schema.studentPass.organizationId, organizationId)),
  });
  if (!pass) return { error: 'NOT_FOUND' as const };
  if (pass.studentId === studentId) return { error: 'IS_HOLDER' as const };
  const del = await db
    .delete(schema.passMember)
    .where(and(eq(schema.passMember.passId, passId), eq(schema.passMember.studentId, studentId)))
    .returning({ id: schema.passMember.studentId });
  if (!del.length) return { error: 'NOT_FOUND' as const };
  await auditStatement({
    organizationId,
    actorUserId: actorId,
    action: 'pass.member_removed',
    entityType: 'student_pass',
    entityId: passId,
    metadata: { studentId },
  });
  return { ok: true as const };
}

/** Pases y pagos de una persona en todas las academias donde es alumna. */
export async function myMembership(userId: string) {
  const students = await db
    .select({ id: schema.student.id, organizationId: schema.student.organizationId, organizationName: schema.organization.name, organizationLogo: schema.organization.logo })
    .from(schema.student)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.student.organizationId))
    .where(eq(schema.student.userId, userId));
  const passes = [];
  for (const s of students) {
    for (const p of await studentPasses(s.id))
      passes.push({ ...p, viewerStudentId: s.id, organizationId: s.organizationId, organizationName: s.organizationName, organizationLogo: s.organizationLogo });
  }
  const sids = students.map((s) => s.id);
  const payments = sids.length
    ? await db
        .select({
          id: schema.payment.id,
          concept: schema.payment.concept,
          amountCents: schema.payment.amountCents,
          method: schema.payment.method,
          status: schema.payment.status,
          reference: schema.payment.reference,
          paidAt: schema.payment.paidAt,
          createdAt: schema.payment.createdAt,
          organizationId: schema.payment.organizationId,
          organizationName: schema.organization.name,
          currency: schema.organizationDetail.currency,
        })
        .from(schema.payment)
        .innerJoin(schema.organization, eq(schema.organization.id, schema.payment.organizationId))
        .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
        .where(inArray(schema.payment.studentId, sids))
        .orderBy(desc(schema.payment.createdAt))
        .limit(30)
    : [];
  return { passes, payments };
}

/** Historial de pagos de una persona en todas sus academias, del más reciente al más antiguo (por páginas; filtra por academia). */
export async function myPaymentHistory(userId: string, opts: { organizationId?: string; limit?: number; offset?: number } = {}) {
  const students = await db.select({ id: schema.student.id }).from(schema.student).where(eq(schema.student.userId, userId));
  if (!students.length) return [];
  return db
    .select({
      id: schema.payment.id,
      concept: schema.payment.concept,
      amountCents: schema.payment.amountCents,
      method: schema.payment.method,
      status: schema.payment.status,
      reference: schema.payment.reference,
      paidAt: schema.payment.paidAt,
      createdAt: schema.payment.createdAt,
      organizationId: schema.payment.organizationId,
      organizationName: schema.organization.name,
      organizationLogo: schema.organization.logo,
      currency: schema.organizationDetail.currency,
    })
    .from(schema.payment)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.payment.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .where(
      and(
        inArray(
          schema.payment.studentId,
          students.map((s) => s.id)
        ),
        opts.organizationId ? eq(schema.payment.organizationId, opts.organizationId) : undefined
      )
    )
    .orderBy(desc(schema.payment.createdAt), desc(schema.payment.id))
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
}

/* ── Transferencia iniciada por la persona ────────────────────────────────── */

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newReference = () =>
  'STG-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');

/** Productos que ve una persona en el perfil de una academia publicada, y cómo puede pagar. */
export async function publicProducts(organizationId: string) {
  const pub = await db.query.organizationDetail.findFirst({
    where: and(eq(schema.organizationDetail.organizationId, organizationId), eq(schema.organizationDetail.isPublished, true)),
  });
  if (!pub) return null;
  const [products, settings] = await Promise.all([listProducts(organizationId, { onlyVisible: true }), getPaymentSettings(organizationId)]);
  return {
    currency: pub.currency,
    acceptsCash: settings.acceptsCash,
    acceptsTransfer: settings.acceptsTransfer && !!settings.clabe,
    acceptsCard: settings.cardReady,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      kind: p.kind,
      priceCents: p.priceCents,
      credits: p.credits,
      validityDays: p.validityDays,
      seats: p.seats,
    })),
  };
}

function bankInfo(settings: Awaited<ReturnType<typeof getPaymentSettings>>) {
  return { bank: settings.bank, clabe: settings.clabe, beneficiary: settings.beneficiary };
}

/** La persona pide pagar un producto por transferencia: queda pendiente con una referencia para que la academia lo reconozca. */
export async function requestTransfer(u: { id: string; name: string; email: string }, productId: string) {
  const product = await db.query.product.findFirst({
    where: and(eq(schema.product.id, productId), eq(schema.product.isActive, true), eq(schema.product.isVisible, true)),
  });
  if (!product) return { error: 'NOT_FOUND' as const };
  const pub = await db.query.organizationDetail.findFirst({
    where: and(eq(schema.organizationDetail.organizationId, product.organizationId), eq(schema.organizationDetail.isPublished, true)),
  });
  const settings = await getPaymentSettings(product.organizationId);
  if (!pub || !settings.acceptsTransfer || !settings.clabe) return { error: 'TRANSFER_NOT_ACCEPTED' as const };

  const studentId = await ensureStudentForUser(product.organizationId, u);
  // Si ya tiene una pendiente de este producto, se reutiliza (no se acumulan referencias).
  const existing = await db.query.payment.findFirst({
    where: and(eq(schema.payment.studentId, studentId), eq(schema.payment.productId, product.id), eq(schema.payment.status, 'PENDING')),
  });
  if (existing)
    return {
      id: existing.id,
      reference: existing.reference!,
      amountCents: existing.amountCents,
      concept: existing.concept,
      currency: pub.currency,
      ...bankInfo(settings),
      reused: true,
    };

  for (let attempt = 0; attempt < 4; attempt++) {
    const reference = newReference();
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.insert(schema.payment).values({
          id,
          organizationId: product.organizationId,
          studentId,
          productId: product.id,
          concept: product.name,
          amountCents: product.priceCents,
          method: 'TRANSFER',
          status: 'PENDING',
          reference,
          createdBy: u.id,
        }),
        auditStatement({
          organizationId: product.organizationId,
          actorUserId: u.id,
          action: 'payment.transfer_requested',
          entityType: 'payment',
          entityId: id,
          metadata: { productId: product.id, amountCents: product.priceCents },
        }),
      ] as Batch);
      return {
        id,
        reference,
        amountCents: product.priceCents,
        concept: product.name,
        currency: pub.currency,
        ...bankInfo(settings),
        reused: false,
      };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return { error: 'TRY_AGAIN' as const };
}

/** La persona avisa que ya transfirió y deja la clave de rastreo del banco. */
export async function notifyTransfer(userId: string, paymentId: string, trackingKey: string) {
  const [row] = await db
    .select({ id: schema.payment.id, organizationId: schema.payment.organizationId })
    .from(schema.payment)
    .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
    .where(and(eq(schema.payment.id, paymentId), eq(schema.student.userId, userId), eq(schema.payment.status, 'PENDING')));
  if (!row) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db
      .update(schema.payment)
      .set({ trackingKey: clean(trackingKey) })
      .where(eq(schema.payment.id, paymentId)),
    auditStatement({
      organizationId: row.organizationId,
      actorUserId: userId,
      action: 'payment.transfer_notified',
      entityType: 'payment',
      entityId: paymentId,
    }),
  ] as Batch);
  // El equipo que confirma pagos se entera de que hay una transferencia por revisar.
  const who = await db.query.student.findFirst({ where: eq(schema.student.userId, userId), columns: { name: true } });
  await notifyMany(await membersWith(row.organizationId, 'payment', 'update'), {
    category: 'payment',
    organizationId: row.organizationId,
    title: 'Transferencia por confirmar',
    body: `${who?.name ?? 'Un alumno'} avisó que ya transfirió.`,
    url: '/payments',
  });
  return { ok: true as const };
}

/** Datos de una transferencia propia (para volver a ver la CLABE y la referencia). */
export async function myTransfer(userId: string, paymentId: string) {
  const [row] = await db
    .select({
      id: schema.payment.id,
      organizationId: schema.payment.organizationId,
      organizationName: schema.organization.name,
      reference: schema.payment.reference,
      trackingKey: schema.payment.trackingKey,
      amountCents: schema.payment.amountCents,
      concept: schema.payment.concept,
      status: schema.payment.status,
    })
    .from(schema.payment)
    .innerJoin(schema.student, eq(schema.student.id, schema.payment.studentId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.payment.organizationId))
    .where(and(eq(schema.payment.id, paymentId), eq(schema.student.userId, userId), eq(schema.payment.method, 'TRANSFER')));
  if (!row) return null;
  const [settings, cur] = await Promise.all([getPaymentSettings(row.organizationId), orgTz(row.organizationId)]);
  return { ...row, currency: cur.currency, ...bankInfo(settings) };
}

/**
 * Qué paquete de la persona cubriría una clase (para avisarle antes de reservar). No consume nada: los créditos se
 * descuentan con la asistencia. `reserved` son sus otras reservas futuras en la academia, que también pedirán crédito.
 */
export async function passForSession(userId: string, organizationId: string, startsAt: Date) {
  const st = await db.query.student.findFirst({
    where: and(eq(schema.student.organizationId, organizationId), eq(schema.student.userId, userId)),
    columns: { id: true },
  });
  if (!st) return null;
  const at = startsAt.getTime();
  const covering = (await studentPasses(st.id)).filter(
    (p) => p.startsAt.getTime() <= at && (!p.expiresAt || p.expiresAt.getTime() >= at) && (p.remaining == null || p.remaining > 0)
  );
  // El que se vence primero se usa primero (igual que en el reparto de asistencias).
  const pass = covering.sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity))[0];
  if (!pass) return null;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.booking)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .where(
      and(
        eq(schema.booking.studentId, st.id),
        eq(schema.booking.status, 'CONFIRMED'),
        gte(schema.classSession.startsAt, new Date())
      )
    );
  return { name: pass.name, remaining: pass.remaining, expiresAt: pass.expiresAt, reserved: Number(n) };
}
