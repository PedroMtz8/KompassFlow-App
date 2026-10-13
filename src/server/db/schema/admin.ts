import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { organization, user } from './auth';

/**
 * Ajustes de los planes SaaS que edita el administrador de la plataforma. Una fila por plan; cada columna en `null` usa el valor
 * por defecto del código (`billing/plans.ts`) o de las variables de entorno. Los límites en `-1` = sin límite.
 */
export const planSetting = sqliteTable('plan_setting', {
  plan: text('plan').primaryKey(),
  priceMxn: integer('price_mxn'),
  trialDays: integer('trial_days'),
  maxStudents: integer('max_students'),
  maxMembers: integer('max_members'),
  maxLocations: integer('max_locations'),
  reports: integer('reports', { mode: 'boolean' }),
  /** Comisión sobre los cobros con tarjeta de los alumnos, en puntos base (100 = 1%). */
  cardFeeBps: integer('card_fee_bps'),
  /** Precio vigente en Stripe (se crea uno nuevo cada vez que cambia el monto). */
  stripePriceId: text('stripe_price_id'),
  /** Precios anteriores (JSON): las suscripciones que ya los tienen siguen siendo de este plan. */
  retiredPriceIds: text('retired_price_ids'),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

/**
 * Plan otorgado a mano por la administración (cortesía, prueba extendida, acuerdo comercial). Mientras esté vigente manda sobre la
 * suscripción de Stripe; al vencer (o al quitarlo) la academia vuelve al plan que realmente paga.
 */
export const planOverride = sqliteTable('plan_override', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull(),
  /** `null` = sin vencimiento. */
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  note: text('note'),
  grantedBy: text('granted_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

/**
 * Cuenta suspendida por la administración: no puede iniciar sesión ni usar la API. Una fila por usuario; quitarla la reactiva.
 * Vive aparte de `user` (tabla de Better Auth, que se regenera).
 */
export const userSuspension = sqliteTable('user_suspension', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Motivo interno. */
  reason: text('reason').notNull(),
  suspendedBy: text('suspended_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
