import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { organization, user } from './auth';
import { student } from './bookings';

/**
 * Producto = la forma comercial en que se vende el acceso (PRD §6): clase suelta, paquete de créditos o
 * mensualidad. Dinero en centavos. Los productos dejan de venderse con `is_active = false` (no se borran,
 * porque pagos y pases históricos los referencian).
 */
export const product = sqliteTable(
  'product',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** SINGLE = 1 clase; PACKAGE = N créditos; MEMBERSHIP = ilimitado durante la vigencia. */
    kind: text('kind', { enum: ['SINGLE', 'PACKAGE', 'MEMBERSHIP'] }).notNull(),
    priceCents: integer('price_cents').notNull(),
    /** Créditos que da (SINGLE = 1, PACKAGE = N, MEMBERSHIP = null → ilimitado). */
    credits: integer('credits'),
    /** Días de vigencia desde el pago; null = no vence. */
    validityDays: integer('validity_days'),
    /** Personas que comparten el paquete (1 = individual). El precio es del paquete completo, no por persona. */
    seats: integer('seats').default(1).notNull(),
    /** Visible para alumnos en el perfil público. */
    isVisible: integer('is_visible', { mode: 'boolean' }).default(true).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [index('product_org_active_idx').on(t.organizationId, t.isActive)]
);

/** Cierre de caja: lo que el sistema esperaba de efectivo contra lo que se contó. */
export const cashClose = sqliteTable(
  'cash_close',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    expectedCents: integer('expected_cents').notNull(),
    countedCents: integer('counted_cents').notNull(),
    note: text('note'),
    closedBy: text('closed_by').references(() => user.id, { onDelete: 'set null' }),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [index('cash_close_org_closed_idx').on(t.organizationId, t.closedAt)]
);

/**
 * Payment = registro de un cobro (PRD: online y manuales son registros de primera clase). Hoy cubre pagos
 * manuales (efectivo, transferencia, otro) y transferencias que el alumno avisa y el personal confirma.
 */
export const payment = sqliteTable(
  'payment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => student.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => product.id, { onDelete: 'set null' }),
    /** Texto del concepto al momento del cobro (el producto puede cambiar después). */
    concept: text('concept').notNull(),
    amountCents: integer('amount_cents').notNull(),
    method: text('method', { enum: ['CASH', 'TRANSFER', 'OTHER', 'CARD'] }).notNull(),
    /** PAID = cobrado; PENDING = transferencia por confirmar; REJECTED = no se recibió. */
    status: text('status', { enum: ['PAID', 'PENDING', 'REJECTED', 'REFUNDED'] }).notNull(),
    /** Referencia de la transferencia (la que da la academia) o clave de rastreo (la que da el banco). */
    reference: text('reference'),
    trackingKey: text('tracking_key'),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    confirmedBy: text('confirmed_by').references(() => user.id, { onDelete: 'set null' }),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
    cashCloseId: text('cash_close_id').references(() => cashClose.id, { onDelete: 'set null' }),
    /** Cobro con tarjeta (Stripe Connect): sesión de Checkout que lo originó (única: así un webhook repetido no duplica nada). */
    stripeSessionId: text('stripe_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    /** Tipo de tarjeta con la que se pagó (credit, debit, prepaid) y su marca: solo lo ve la administración de la plataforma. */
    cardFunding: text('card_funding'),
    cardBrand: text('card_brand'),
    /** Comisión de la plataforma sobre este cobro (centavos); 0 si no se cobra. */
    feeCents: integer('fee_cents').default(0).notNull(),
    refundedAt: integer('refunded_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // Ingresos del mes y por método (reportes y pantalla de Pagos).
    index('payment_org_status_paid_idx').on(t.organizationId, t.status, t.paidAt),
    // Historial de una persona.
    index('payment_student_created_idx').on(t.studentId, t.createdAt),
    // Efectivo pendiente de corte.
    index('payment_org_method_close_idx').on(t.organizationId, t.method, t.cashCloseId),
    uniqueIndex('payment_stripe_session_uidx')
      .on(t.stripeSessionId)
      .where(sql`${t.stripeSessionId} is not null`),
    // La referencia de una transferencia es única por organización.
    uniqueIndex('payment_org_reference_uidx')
      .on(t.organizationId, t.reference)
      .where(sql`${t.reference} is not null`),
  ]
);

/**
 * Pase = lo que da un producto pagado: créditos (o acceso ilimitado) y vigencia. Los créditos USADOS no se
 * guardan: se derivan de las asistencias registradas (presente), así no hay contadores que se desincronicen.
 */
export const studentPass = sqliteTable(
  'student_pass',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => student.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => product.id, { onDelete: 'set null' }),
    paymentId: text('payment_id').references(() => payment.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** Lugares del paquete al venderse (copiados del producto: cambiarlo después no afecta pases ya vendidos). */
    seats: integer('seats').default(1).notNull(),
    /** null = ilimitado. */
    creditsTotal: integer('credits_total'),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    /** null = no vence. */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index('pass_student_starts_idx').on(t.studentId, t.startsAt),
    index('pass_org_product_idx').on(t.organizationId, t.productId),
    // Un pago genera a lo sumo un pase (evita duplicarlo si se confirma dos veces).
    uniqueIndex('pass_payment_uidx')
      .on(t.paymentId)
      .where(sql`${t.paymentId} is not null`),
  ]
);

/** Cómo cobra la organización: efectivo y/o transferencia (con sus datos bancarios). */
export const paymentSettings = sqliteTable('payment_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  acceptsCash: integer('accepts_cash', { mode: 'boolean' }).default(true).notNull(),
  acceptsTransfer: integer('accepts_transfer', { mode: 'boolean' }).default(false).notNull(),
  bank: text('bank'),
  clabe: text('clabe'),
  beneficiary: text('beneficiary'),
  /** Cuenta Express de Stripe Connect de la academia (cobro con tarjeta). Los indicadores se sincronizan con Stripe. */
  stripeAccountId: text('stripe_account_id'),
  stripeChargesEnabled: integer('stripe_charges_enabled', { mode: 'boolean' }).default(false).notNull(),
  stripePayoutsEnabled: integer('stripe_payouts_enabled', { mode: 'boolean' }).default(false).notNull(),
  stripeDetailsSubmitted: integer('stripe_details_submitted', { mode: 'boolean' }).default(false).notNull(),
});

export const paymentRelations = relations(payment, ({ one }) => ({
  student: one(student, { fields: [payment.studentId], references: [student.id] }),
  product: one(product, { fields: [payment.productId], references: [product.id] }),
}));

/**
 * Personas que comparten un pase además del titular (quien pagó, `student_pass.student_id`, que siempre cuenta como
 * miembro). Los lugares libres son `seats - 1 - miembros`: se puede vender con una sola persona y sumar a las demás
 * después, sin que tengan cuenta (basta un registro de alumno).
 */
export const passMember = sqliteTable(
  'pass_member',
  {
    passId: text('pass_id')
      .notNull()
      .references(() => studentPass.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => student.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
    addedAt: integer('added_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex('pass_member_pass_student_uidx').on(t.passId, t.studentId), index('pass_member_student_idx').on(t.studentId)]
);
