import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Catálogo geográfico: ciudades y sus colonias/zonas. Es la base de "cerca de mí", de los filtros por
 * zona en Descubrir y de la zona horaria por defecto. Abrir una ciudad nueva es insertar filas.
 *
 * Jerarquía de un nivel: CITY -> NEIGHBORHOOD. Las coordenadas son el centro aproximado de la zona;
 * se usan como respaldo cuando una sede aún no tiene coordenadas exactas (geocodificación).
 */
export const zone = sqliteTable(
  'zone',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['CITY', 'NEIGHBORHOOD'] }).notNull(),
    /** Ciudad a la que pertenece (solo NEIGHBORHOOD). */
    parentId: text('parent_id').references((): AnySQLiteColumn => zone.id, { onDelete: 'cascade' }),
    state: text('state'),
    country: text('country').default('MX').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    /** Zona horaria IANA (en las ciudades; las colonias heredan la de su ciudad). */
    timezone: text('timezone'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('zone_slug_uidx').on(t.slug),
    // Colonias de una ciudad, en orden.
    index('zone_parent_sort_idx').on(t.parentId, t.sortOrder),
    // Ciudades activas para el selector.
    index('zone_kind_active_idx').on(t.kind, t.isActive),
    // Caja geográfica para "zona más cercana".
    index('zone_geo_idx').on(t.lat, t.lng),
  ]
);
