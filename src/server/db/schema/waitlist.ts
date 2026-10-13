import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { organization } from './auth';
import { student } from './bookings';
import { classSession } from './classes';

/**
 * Lista de espera de una sesión llena. Cuando se libera un lugar, el primero de la fila lo recibe APARTADO por un tiempo
 * (`OFFERED`, hasta `offerExpiresAt`): ese lugar cuenta como ocupado para cualquier otra reserva. Si lo toma, la entrada
 * pasa a `BOOKED`; si no, vence (`EXPIRED`) y se ofrece al siguiente.
 */
export const waitlistEntry = sqliteTable(
  'waitlist_entry',
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
    status: text('status', { enum: ['WAITING', 'OFFERED', 'BOOKED', 'EXPIRED', 'CANCELED'] })
      .default('WAITING')
      .notNull(),
    offeredAt: integer('offered_at', { mode: 'timestamp_ms' }),
    offerExpiresAt: integer('offer_expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // Una persona solo puede estar una vez en la fila de una sesión (las entradas ya resueltas no cuentan).
    uniqueIndex('waitlist_active_uidx')
      .on(t.sessionId, t.studentId)
      .where(sql`${t.status} in ('WAITING', 'OFFERED')`),
    index('waitlist_session_status_idx').on(t.sessionId, t.status, t.createdAt),
    index('waitlist_student_idx').on(t.studentId, t.status),
  ]
);
