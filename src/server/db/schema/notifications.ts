import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

/**
 * Avisos dentro de la app (la «campana»). Existen aunque la persona no tenga notificaciones push: son la fuente de verdad y
 * la push es solo un aviso extra. `organizationId` NO es llave foránea a propósito: si la academia se elimina, el aviso
 * de que canceló sus clases debe seguir existiendo.
 */
export const notification = sqliteTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id'),
    /** reminder = recordatorio de clase · class = cambios en tus clases · payment = pagos y paquetes · team = equipo */
    category: text('category', { enum: ['reminder', 'class', 'payment', 'team'] }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Ruta de la app que se abre al tocar el aviso (p. ej. `/booking?bookingId=…`). */
    url: text('url'),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [index('notification_user_created_idx').on(t.userId, t.createdAt), index('notification_user_unread_idx').on(t.userId, t.readAt)]
);

/** Dispositivos donde la persona quiere recibir push (token de Expo). Un mismo dispositivo solo pertenece a una cuenta. */
export const pushToken = sqliteTable(
  'push_token',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex('push_token_token_uidx').on(t.token), index('push_token_user_idx').on(t.userId)]
);

/** Qué avisos quiere recibir cada persona (todos activos por omisión). */
export const notificationPref = sqliteTable('notification_pref', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  reminders: integer('reminders', { mode: 'boolean' }).default(true).notNull(),
  classChanges: integer('class_changes', { mode: 'boolean' }).default(true).notNull(),
  payments: integer('payments', { mode: 'boolean' }).default(true).notNull(),
  team: integer('team', { mode: 'boolean' }).default(true).notNull(),
});

/** Marcas para no repetir un aviso programado (recordatorio de una clase, paquete por vencer…). */
export const notificationDedupe = sqliteTable('notification_dedupe', {
  key: text('key').primaryKey(),
  at: integer('at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
