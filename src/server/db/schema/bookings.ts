import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { organization, user } from './auth';
import { classSession } from './classes';

/**
 * Student = la persona como cliente de UNA organización. Es independiente de la cuenta (PRD regla 6):
 * puede existir sin `user_id` (alta en recepción) y vincularse después sin perder el historial.
 */
export const student = sqliteTable(
  'student',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Cuenta vinculada (opcional). */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    level: text('level', { enum: ['NEW', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'] })
      .default('NEW')
      .notNull(),
    /** Notas internas de la organización: nunca se exponen al propio alumno (PRD §18). */
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // Una cuenta tiene a lo sumo UN registro de alumno por organización.
    uniqueIndex('student_org_user_uidx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('student_org_name_idx').on(t.organizationId, t.name),
    index('student_org_phone_idx').on(t.organizationId, t.phone),
    index('student_user_idx').on(t.userId),
  ]
);

/**
 * Booking = la reserva de un alumno en una sesión. El cupo se valida EN LA MISMA sentencia que la
 * inserta (ver `bookSession`), así dos reservas simultáneas nunca superan `class_session.capacity`.
 */
export const booking = sqliteTable(
  'booking',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => classSession.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => student.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['CONFIRMED', 'CANCELED'] })
      .default('CONFIRMED')
      .notNull(),
    /** Quién la originó: el propio alumno o el personal de la organización. */
    source: text('source', { enum: ['STUDENT', 'STAFF'] }).notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    /** El propio alumno avisó que llegó. No es asistencia: la confirma la academia (o se confirma al cerrar la lista). */
    checkedInAt: integer('checked_in_at', { mode: 'timestamp_ms' }),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    canceledBy: text('canceled_by').references(() => user.id, { onDelete: 'set null' }),
    cancelReason: text('cancel_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // No se puede reservar dos veces la misma sesión (las canceladas no cuentan).
    uniqueIndex('booking_session_student_active_uidx')
      .on(t.sessionId, t.studentId)
      .where(sql`${t.status} = 'CONFIRMED'`),
    // Conteo de cupo por sesión (ruta caliente de cada reserva).
    index('booking_session_status_idx').on(t.sessionId, t.status),
    // "Mis clases" del alumno y su historial.
    index('booking_student_created_idx').on(t.studentId, t.createdAt),
    index('booking_org_created_idx').on(t.organizationId, t.createdAt),
  ]
);

export const studentRelations = relations(student, ({ one, many }) => ({
  organization: one(organization, { fields: [student.organizationId], references: [organization.id] }),
  user: one(user, { fields: [student.userId], references: [user.id] }),
  bookings: many(booking),
}));

export const bookingRelations = relations(booking, ({ one }) => ({
  session: one(classSession, { fields: [booking.sessionId], references: [classSession.id] }),
  student: one(student, { fields: [booking.studentId], references: [student.id] }),
}));

/**
 * Attendance = el resultado de una reserva el día de la sesión. Una fila por reserva (índice único):
 * marcar de nuevo reemplaza el estado. "Sin marcar" es la ausencia de fila.
 */
export const attendance = sqliteTable(
  'attendance',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => classSession.id, { onDelete: 'cascade' }),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => student.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['PRESENT', 'ABSENT'] }).notNull(),
    markedBy: text('marked_by').references(() => user.id, { onDelete: 'set null' }),
    markedAt: integer('marked_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('attendance_booking_uidx').on(t.bookingId),
    // Resumen de una sesión (presentes / faltas).
    index('attendance_session_status_idx').on(t.sessionId, t.status),
    // Historial del alumno y reportes por fecha.
    index('attendance_student_marked_idx').on(t.studentId, t.markedAt),
    index('attendance_org_marked_idx').on(t.organizationId, t.markedAt),
  ]
);

export const attendanceRelations = relations(attendance, ({ one }) => ({
  booking: one(booking, { fields: [attendance.bookingId], references: [booking.id] }),
  student: one(student, { fields: [attendance.studentId], references: [student.id] }),
}));

/**
 * Código de un solo uso para vincular un alumno creado en recepción con la cuenta de la persona
 * (PRD regla 7). Se guarda solo el hash; vence y se consume al canjearse.
 */
export const studentLinkCode = sqliteTable(
  'student_link_code',
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
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex('student_link_code_hash_uidx').on(t.codeHash), index('student_link_code_student_idx').on(t.studentId)]
);
