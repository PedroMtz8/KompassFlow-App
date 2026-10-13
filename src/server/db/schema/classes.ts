import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { organization, user } from './auth';
import { discipline } from './catalog';
import { room } from './organizations';

/**
 * Service = QUÉ se vende (clase de bachata, sesión de box, entrenamiento de fútbol, privada…).
 * La organización que lo publica es también su responsable financiera (PRD regla 8, sin split payments).
 * Nada aquí es específico de un rubro: la disciplina viene del catálogo del rubro de la organización.
 */
export const service = sqliteTable(
  'service',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** GROUP = clase grupal; PRIVATE = 1:1 o pareja; WORKSHOP = taller/evento puntual. */
    kind: text('kind', { enum: ['GROUP', 'PRIVATE', 'WORKSHOP'] })
      .default('GROUP')
      .notNull(),
    /** Disciplina dentro del rubro de la organización (bachata, box, fútbol…). */
    disciplineId: text('discipline_id').references(() => discipline.id, { onDelete: 'set null' }),
    level: text('level', { enum: ['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'] })
      .default('ALL')
      .notNull(),
    /** Dinero en centavos (enteros): nunca decimales flotantes. La moneda es la de la organización. */
    priceCents: integer('price_cents').default(0).notNull(),
    durationMin: integer('duration_min').notNull(),
    /** Solo PRIVATE: quién la imparte (su disponibilidad define los horarios reservables). */
    instructorUserId: text('instructor_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Solo PRIVATE: descanso (min) entre una sesión y la siguiente. */
    bufferMin: integer('buffer_min').default(0).notNull(),
    /** Cupo por defecto al programar sesiones (se acota al cupo del espacio). */
    defaultCapacity: integer('default_capacity'),
    coverImage: text('cover_image'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('service_org_active_idx').on(t.organizationId, t.isActive), index('service_discipline_idx').on(t.disciplineId)]
);

/** Regla de recurrencia con la que se generaron sesiones ("martes y jueves 19:00 hasta el 30 jun"). */
export const sessionSeries = sqliteTable(
  'session_series',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    roomId: text('room_id').references(() => room.id, { onDelete: 'set null' }),
    instructorUserId: text('instructor_user_id').references(() => user.id, { onDelete: 'set null' }),
    capacity: integer('capacity').notNull(),
    /** JSON con los días de la semana (0 = domingo … 6 = sábado). */
    weekdays: text('weekdays').notNull(),
    /** Hora local de inicio "HH:MM" en la zona de la organización. */
    startTime: text('start_time').notNull(),
    durationMin: integer('duration_min').notNull(),
    /** Fechas locales "YYYY-MM-DD". */
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    timezone: text('timezone').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [index('series_org_idx').on(t.organizationId), index('series_service_idx').on(t.serviceId)]
);

/**
 * ClassSession = CUÁNDO ocurre (PRD: Service separado de ClassSession). Las fechas se guardan en UTC
 * (ms) y se muestran en la zona horaria de la organización (PRD regla 9). `bookings` (Fase 3) colgará de aquí.
 */
export const classSession = sqliteTable(
  'class_session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    seriesId: text('series_id').references(() => sessionSeries.id, { onDelete: 'set null' }),
    roomId: text('room_id').references(() => room.id, { onDelete: 'set null' }),
    instructorUserId: text('instructor_user_id').references(() => user.id, { onDelete: 'set null' }),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
    /** Cupo de ESTA sesión (≤ cupo del espacio). Es el tope que valida la reserva transaccional. */
    capacity: integer('capacity').notNull(),
    status: text('status', { enum: ['SCHEDULED', 'CANCELED'] })
      .default('SCHEDULED')
      .notNull(),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    /** Cuando el personal cerró el pase de lista (las reservas sin marcar quedan como falta). */
    attendanceClosedAt: integer('attendance_closed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // Agenda de la organización por rango de fechas (la consulta más frecuente).
    index('session_org_status_starts_idx').on(t.organizationId, t.status, t.startsAt),
    // Choques de espacio y de instructor.
    index('session_room_starts_idx').on(t.roomId, t.startsAt),
    index('session_instructor_starts_idx').on(t.instructorUserId, t.startsAt),
    index('session_service_starts_idx').on(t.serviceId, t.startsAt),
    index('session_series_idx').on(t.seriesId),
  ]
);

export const serviceRelations = relations(service, ({ one, many }) => ({
  organization: one(organization, { fields: [service.organizationId], references: [organization.id] }),
  discipline: one(discipline, { fields: [service.disciplineId], references: [discipline.id] }),
  sessions: many(classSession),
}));

export const classSessionRelations = relations(classSession, ({ one }) => ({
  service: one(service, { fields: [classSession.serviceId], references: [service.id] }),
  room: one(room, { fields: [classSession.roomId], references: [room.id] }),
  series: one(sessionSeries, { fields: [classSession.seriesId], references: [sessionSeries.id] }),
}));

/**
 * Disponibilidad semanal de quien imparte privadas: ventanas de hora local ("HH:MM") por día de la semana
 * (0 = domingo … 6 = sábado) en la zona de la organización. Puede haber varias ventanas el mismo día.
 */
export const instructorAvailability = sqliteTable(
  'instructor_availability',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
  },
  (t) => [index('availability_org_user_weekday_idx').on(t.organizationId, t.userId, t.weekday)]
);
