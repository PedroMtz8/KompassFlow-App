import { relations, sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

/**
 * Catálogo de rubros. Un Vertical es la categoría de actividad (Baile, Fitness/Gyms, Deportes…) y
 * sus disciplinas son la segmentación dentro de él (bachata, salsa… / box, calistenia…).
 * Activar un rubro nuevo es insertar filas y poner `is_active = 1`: no requiere cambios de código.
 */
export const vertical = sqliteTable(
  'vertical',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** Activo = se puede elegir y operar; inactivo = aparece como "Próximamente". */
    isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    /**
     * Vocabulario del rubro (JSON): { room, instructor, session }. Permite que la interfaz diga
     * "salón / instructor / clase" en baile y "cancha / entrenador / entrenamiento" en deportes
     * sin ramas de código por rubro.
     */
    terms: text('terms'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('vertical_slug_uidx').on(t.slug),
    // Listado del onboarding: activos primero, en orden.
    index('vertical_active_sort_idx').on(t.isActive, t.sortOrder),
  ]
);

export const discipline = sqliteTable(
  'discipline',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    verticalId: text('vertical_id')
      .notNull()
      .references(() => vertical.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (t) => [
    // Un slug se repite entre rubros (p. ej. "yoga"), pero no dentro del mismo.
    uniqueIndex('discipline_vertical_slug_uidx').on(t.verticalId, t.slug),
    index('discipline_vertical_sort_idx').on(t.verticalId, t.sortOrder),
  ]
);

/** Rubros que le interesan al usuario (paso 1 del onboarding; por defecto, Baile). */
export const userVertical = sqliteTable(
  'user_vertical',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verticalId: text('vertical_id')
      .notNull()
      .references(() => vertical.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.verticalId] }),
    // "¿A quién le interesa este rubro?" (segmentación, avisos de apertura).
    index('user_vertical_vertical_idx').on(t.verticalId),
  ]
);

/** Disciplinas elegidas (paso 2 del onboarding). Solo personalizan; nunca limitan el acceso. */
export const userInterest = sqliteTable(
  'user_interest',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    disciplineId: text('discipline_id')
      .notNull()
      .references(() => discipline.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.disciplineId] }), index('user_interest_discipline_idx').on(t.disciplineId)]
);

export const verticalRelations = relations(vertical, ({ many }) => ({
  disciplines: many(discipline),
}));

export const disciplineRelations = relations(discipline, ({ one }) => ({
  vertical: one(vertical, { fields: [discipline.verticalId], references: [vertical.id] }),
}));
