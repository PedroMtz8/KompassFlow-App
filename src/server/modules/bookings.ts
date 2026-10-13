import { Elysia, t } from 'elysia';

import { listPayments, passForSession, studentPasses } from '../db/payments';
import { allow } from '../lib/rate-limit';
import { checkLimit } from '../db/billing';
import { createLinkCode, redeemLinkCode } from '../db/student-link';
import { settleWaitlist, waitlistFor } from '../db/waitlist';
import { authPlugin } from '../auth/plugin';
import {
  bookAsUser,
  bookSession,
  cancelBooking,
  checkInBooking,
  createStudent,
  discoverOrg,
  discoverOrgs,
  discoverSession,
  discoverSessions,
  getStudent,
  getMyBooking,
  listMyBookings,
  myBookingSummary,
  myProfileSummary,
  listStudents,
  roster,
  updateStudent,
} from '../db/bookings';
import { authorize, getMemberRole } from '../db/organizations';
import { hasError } from './result';

const text = (max: number) => t.String({ maxLength: max });
/** Paginación por desplazamiento: `limit` (1–100) y `offset`. Sin ellos, la primera página. */
const pageQuery = { limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })), offset: t.Optional(t.Numeric({ minimum: 0, maximum: 100_000 })) };
const pageOf = (q: { limit?: number; offset?: number }, size = 50) => ({ limit: q.limit ?? size, offset: q.offset ?? 0 });

const bookErrors = {
  NOT_BOOKABLE: [409, 'Esta sesión ya no está disponible.'],
  FULL: [409, 'La sesión está llena.'],
  ALREADY_BOOKED: [409, 'Ya tienes un lugar en esta sesión.'],
  STUDENT_NOT_FOUND: [404, 'No encontramos a ese alumno.'],
} as const;

const checkInErrors = {
  NOT_FOUND: [404, 'No encontrada.'],
  CANCELED: [409, 'Esta reserva o clase está cancelada.'],
  TOO_EARLY: [409, 'Aún es pronto: puedes avisar que llegaste 30 minutos antes de la clase.'],
  ENDED: [409, 'Pasaron más de 7 días desde la clase: ya no se puede avisar. Habla con la academia.'],
  CLOSED: [409, 'La academia ya cerró la lista de esta clase.'],
} as const;

const cancelErrors = {
  NOT_FOUND: [404, 'No encontrada.'],
  ALREADY_STARTED: [409, 'La sesión ya comenzó.'],
  TOO_LATE: [409, 'Ya no puedes cancelar: pasó el plazo. Contacta a la organización.'],
} as const;

const studentFields = {
  name: t.String({ minLength: 2, maxLength: 100 }),
  phone: t.Optional(text(32)),
  email: t.Optional(t.String({ format: 'email', maxLength: 160 })),
  level: t.Optional(t.Union([t.Literal('NEW'), t.Literal('BEGINNER'), t.Literal('INTERMEDIATE'), t.Literal('ADVANCED')])),
  notes: t.Optional(text(1000)),
};

/** Lado alumno: descubrir sesiones, reservar, "mis clases" y cancelar. Todo opera sobre la cuenta autenticada. */
export const discoverModule = new Elysia({ name: 'discover' })
  .use(authPlugin)
  .get(
    '/discover/sessions',
    ({ user, query }) =>
      discoverSessions(user.id, {
        disciplineIds: query.disciplineIds ? query.disciplineIds.split(',').slice(0, 20) : undefined,
        when: query.when
          ? (query.when.split(',').filter((w) => ['today', 'tomorrow', 'weekend'].includes(w)) as ('today' | 'tomorrow' | 'weekend')[])
          : undefined,
        levels: query.levels
          ? (query.levels.split(',').filter((l) => ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(l)) as (
              'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
            )[])
          : undefined,
        onlyAvailable: query.onlyAvailable === 'true',
        q: query.q,
      }),
    {
      auth: true,
      query: t.Object({
        disciplineIds: t.Optional(text(800)),
        when: t.Optional(text(60)),
        levels: t.Optional(text(60)),
        onlyAvailable: t.Optional(t.Literal('true')),
        q: t.Optional(text(80)),
      }),
    }
  )
  .post(
    '/me/link-code',
    async ({ user, body, status }) => {
      if (!await allow(`redeem:${user.id}`, 8, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await redeemLinkCode(user, body.code);
      if (hasError(r)) return status(404, { message: 'El código no es válido o ya venció. Pídele a tu academia uno nuevo.' });
      return r;
    },
    { auth: true, body: t.Object({ code: t.String({ minLength: 6, maxLength: 20 }) }) }
  )
  .get('/discover/orgs', () => discoverOrgs(), { auth: true })
  .get(
    '/discover/orgs/:id',
    async ({ user, params, status }) => (await discoverOrg(user.id, params.id)) ?? status(404, { message: 'No encontrada' }),
    { auth: true }
  )
  .get(
    '/discover/sessions/:id',
    async ({ user, params, status }) => {
      // Si la sesión tiene fila de espera, primero se vencen las ofertas que ya pasaron de tiempo (así el cupo que se ve es real).
      if ((await waitlistFor(user.id, params.id)).count > 0) await settleWaitlist(params.id);
      const s = await discoverSession(user.id, params.id);
      if (!s) return status(404, { message: 'No encontrada' });
      return { ...s, pass: await passForSession(user.id, s.organizationId, s.startsAt), waitlist: await waitlistFor(user.id, s.id) };
    },
    { auth: true }
  )
  .post(
    '/discover/sessions/:id/book',
    async ({ user, params, status }) => {
      if (!await allow(`book:${user.id}`, 30, 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await bookAsUser(user, params.id);
      if (hasError(r)) return status(bookErrors[r.error][0], { message: bookErrors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .get('/me/bookings', ({ user, query }) => listMyBookings(user.id, query.scope, pageOf(query, 30)), {
    auth: true,
    query: t.Object({ scope: t.Union([t.Literal('upcoming'), t.Literal('past')]), ...pageQuery }),
  })
  .get('/me/profile-summary', ({ user }) => myProfileSummary(user.id), { auth: true })
  .get('/me/bookings/summary', ({ user }) => myBookingSummary(user.id), { auth: true })
  .get('/me/bookings/:id', async ({ user, params, status }) => (await getMyBooking(user.id, params.id)) ?? status(404, { message: 'No encontrada' }), {
    auth: true,
  })
  .post(
    '/me/bookings/:id/check-in',
    async ({ user, params, status }) => {
      if (!await allow(`checkin:${user.id}`, 20, 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const r = await checkInBooking(user.id, params.id);
      if (hasError(r)) return status(checkInErrors[r.error][0], { message: checkInErrors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .post(
    '/me/bookings/:id/cancel',
    async ({ user, params, status }) => {
      const r = await cancelBooking(params.id, { userId: user.id, byStaff: false });
      if (hasError(r)) return status(cancelErrors[r.error][0], { message: cancelErrors[r.error][1] });
      return r;
    },
    { auth: true }
  );

/** Lado organización: alumnos, lista de reservas de una sesión, reservar/cancelar por un alumno. */
export const studentsModule = new Elysia({ name: 'students', prefix: '/orgs' })
  .use(authPlugin)
  .get(
    '/:id/students',
    async ({ user, params, query, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'student', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return listStudents(params.id, query.q, !!(await authorize(user.id, params.id, 'student', 'read_contact')), pageOf(query));
    },
    { auth: true, query: t.Object({ q: t.Optional(text(80)), ...pageQuery }) }
  )
  .post(
    '/:id/students',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'student', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const limit = await checkLimit(params.id, 'students');
      if (!limit.ok) return status(402, { message: limit.message });
      return createStudent(user.id, params.id, body);
    },
    { auth: true, body: t.Object(studentFields) }
  )
  .get(
    '/:id/students/:studentId',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'student', 'read'))) return status(403, { message: 'No tienes permiso.' });
      const st = await getStudent(params.id, params.studentId, !!(await authorize(user.id, params.id, 'student', 'read_contact')));
      if (!st) return status(404, { message: 'No encontrado' });
      // Pagos y pases solo para quien puede ver pagos (recepción, admin, propietario).
      const seesMoney = await authorize(user.id, params.id, 'payment', 'read');
      return {
        ...st,
        passes: seesMoney ? await studentPasses(st.id) : [],
        payments: seesMoney ? await listPayments(params.id, { studentId: st.id, limit: 20 }) : [],
      };
    },
    { auth: true }
  )
  .post(
    '/:id/students/:studentId/link-code',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'student', 'update'))) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`linkcode:${user.id}`, 20, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await createLinkCode(user.id, params.id, params.studentId);
      if (hasError(r))
        return r.error === 'NOT_FOUND'
          ? status(404, { message: 'No encontrado' })
          : status(409, { message: 'Este alumno ya tiene una cuenta vinculada.' });
      return r;
    },
    { auth: true }
  )
  .patch(
    '/:id/students/:studentId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'student', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await updateStudent(user.id, params.id, params.studentId, body);
      if (hasError(r)) return status(404, { message: 'No encontrado' });
      return r;
    },
    { auth: true, body: t.Partial(t.Object(studentFields)) }
  )
  .get(
    '/:id/sessions/:sessionId/roster',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'booking', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return roster(params.id, params.sessionId, !!(await authorize(user.id, params.id, 'student', 'read_contact')));
    },
    { auth: true }
  )
  .post(
    '/:id/sessions/:sessionId/bookings',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'booking', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const r = await bookSession({
        organizationId: params.id,
        sessionId: params.sessionId,
        studentId: body.studentId,
        source: 'STAFF',
        actorId: user.id,
      });
      if (hasError(r))
        return status(bookErrors[r.error][0], { message: bookErrors[r.error][1].replace('Ya tienes', 'Ese alumno ya tiene') });
      return r;
    },
    { auth: true, body: t.Object({ studentId: text(64) }) }
  )
  .post(
    '/:id/bookings/:bookingId/cancel',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'booking', 'cancel'))) return status(403, { message: 'No tienes permiso.' });
      const r = await cancelBooking(params.bookingId, { userId: user.id, organizationId: params.id, byStaff: true });
      if (hasError(r)) return status(cancelErrors[r.error][0], { message: cancelErrors[r.error][1] });
      return r;
    },
    { auth: true }
  );
