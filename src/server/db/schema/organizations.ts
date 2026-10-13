import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { organization, user } from './auth';
import { vertical } from './catalog';
import { zone } from './zones';

/**
 * Datos de dominio de una organización. La tabla `organization` es de Better Auth (se regenera con
 * `auth:generate`), así que lo propio vive aquí en una relación 1:1 y sobrevive a esa regeneración.
 *
 * Regla del PRD: toda organización pertenece a EXACTAMENTE un rubro (`vertical_id`). El rubro decide
 * la taxonomía de disciplinas y el vocabulario (salón/cancha, clase/entrenamiento) de sus servicios.
 */
export const organizationDetail = sqliteTable(
  'organization_detail',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** PERSONAL = instructor/entrenador independiente; STUDIO = academia, estudio, club… */
    type: text('type', { enum: ['PERSONAL', 'STUDIO'] }).notNull(),
    verticalId: text('vertical_id')
      .notNull()
      .references(() => vertical.id, { onDelete: 'restrict' }),
    description: text('description'),
    phone: text('phone'),
    instagram: text('instagram'),
    website: text('website'),
    coverImage: text('cover_image'),
    /** Zona horaria IANA: las fechas se guardan en UTC y se muestran en esta (PRD regla 9). */
    timezone: text('timezone').default('America/Mexico_City').notNull(),
    currency: text('currency').default('MXN').notNull(),
    /** Horas de anticipación mínimas para que un alumno cancele sin intervención del personal. */
    cancelWindowHours: integer('cancel_window_hours').default(4).notNull(),
    /** Visible en Descubrir. Se activa cuando la organización completa su perfil. */
    isPublished: integer('is_published', { mode: 'boolean' }).default(false).notNull(),
    /**
     * Verificación de la plataforma. Solo una organización APPROVED puede estar visible en Descubrir:
     * NONE (no ha pedido) → PENDING (en revisión) → APPROVED | REJECTED (con motivo; puede volver a pedirla).
     */
    verificationStatus: text('verification_status', { enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'] }).default('NONE').notNull(),
    /** Mensaje opcional de la organización al pedir la revisión (p. ej. su página o red social). */
    verificationMessage: text('verification_message'),
    verificationRequestedAt: integer('verification_requested_at', { mode: 'timestamp_ms' }),
    verificationReviewedAt: integer('verification_reviewed_at', { mode: 'timestamp_ms' }),
    verificationReviewedBy: text('verification_reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    /** Cómo se comprobó que existe: WEBSITE, SOCIAL, PHONE, OTHER. */
    verificationMethod: text('verification_method'),
    /** Motivo del rechazo: lo ve la organización. */
    verificationReason: text('verification_reason'),
    /** Nota interna del administrador: la organización no la ve. */
    verificationNote: text('verification_note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // Descubrimiento: organizaciones publicadas de un rubro (y tipo).
    index('org_detail_published_vertical_idx').on(t.isPublished, t.verticalId, t.type),
    index('org_detail_vertical_idx').on(t.verticalId),
  ]
);

/** Sede física. Las coordenadas permiten la búsqueda "cerca de mí" (PRD 7.7). */
export const location = sqliteTable(
  'location',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name'),
    address: text('address').notNull(),
    neighborhood: text('neighborhood'),
    city: text('city').notNull(),
    /** Colonia del catálogo (opcional). Sirve para filtrar por zona y como respaldo de coordenadas. */
    zoneId: text('zone_id').references(() => zone.id, { onDelete: 'set null' }),
    /** Enlace de Google Maps pegado por el negocio (abre la ficha exacta). */
    mapsUrl: text('maps_url'),
    lat: real('lat'),
    lng: real('lng'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index('location_org_idx').on(t.organizationId),
    index('location_zone_idx').on(t.zoneId),
    // Caja geográfica para "cerca de mí" sin PostGIS (lat/lng acotados + haversine en consulta).
    index('location_geo_idx').on(t.lat, t.lng),
  ]
);

/**
 * Espacio donde ocurren las sesiones: salón, sala, cancha, ring… El nombre visible lo decide el
 * rubro (`vertical.terms.room`); aquí es un espacio con capacidad y nada más.
 */
export const room = sqliteTable(
  'room',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Desnormalizado a propósito: todo dato de dominio se filtra por organización (multi-tenant). */
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex('room_location_name_uidx').on(t.locationId, t.name), index('room_org_idx').on(t.organizationId)]
);

/** Historial de operaciones sensibles (PRD regla 5). Sobrevive al borrado de la organización o del usuario. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Verbo con espacio de nombres: "organization.created", "payment.manual_registered"… */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** JSON con el antes/después u otros datos relevantes. */
    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index('audit_org_created_idx').on(t.organizationId, t.createdAt),
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_actor_idx').on(t.actorUserId),
  ]
);

export const organizationDetailRelations = relations(organizationDetail, ({ one }) => ({
  organization: one(organization, { fields: [organizationDetail.organizationId], references: [organization.id] }),
  vertical: one(vertical, { fields: [organizationDetail.verticalId], references: [vertical.id] }),
}));

export const locationRelations = relations(location, ({ one, many }) => ({
  organization: one(organization, { fields: [location.organizationId], references: [organization.id] }),
  rooms: many(room),
}));

export const roomRelations = relations(room, ({ one }) => ({
  location: one(location, { fields: [room.locationId], references: [location.id] }),
}));

/**
 * Contadores del limitador de intentos compartido entre instancias del servidor (ventana fija por clave).
 * Solo se usa con `RATE_LIMIT_STORE=db` (producción); en desarrollo el limitador vive en memoria.
 */
export const appRateLimit = sqliteTable('app_rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: integer('window_start').notNull(),
});
