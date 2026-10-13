import { Elysia } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { authorize, getMemberRole } from '../db/organizations';
import { joinWaitlist, leaveWaitlist, myWaitlist, removeFromWaitlist, sessionWaitlist } from '../db/waitlist';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

const joinErrors = {
  NOT_BOOKABLE: [409, 'Esta sesión ya no está disponible.'],
  NOT_FULL: [409, 'Todavía hay lugares: reserva directo.'],
  ALREADY_BOOKED: [409, 'Ya tienes un lugar en esta sesión.'],
  ALREADY_WAITING: [409, 'Ya estás en la lista de espera.'],
} as const;

/** Lista de espera: unirse y salir (alumno), mis listas, y la fila de cada sesión para el equipo. */
export const waitlistModule = new Elysia({ name: 'waitlist' })
  .use(authPlugin)
  .post(
    '/discover/sessions/:id/waitlist',
    async ({ user, params, status }) => {
      if (!(await allow(`waitlist:${user.id}`, 20, 60_000))) return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await joinWaitlist(user, params.id);
      if (hasError(r)) return status(joinErrors[r.error][0], { message: joinErrors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .delete(
    '/discover/sessions/:id/waitlist',
    async ({ user, params, status }) => {
      const r = await leaveWaitlist(user.id, params.id);
      if (hasError(r)) return status(404, { message: 'No estás en la lista de espera.' });
      return r;
    },
    { auth: true }
  )
  .get('/me/waitlist', ({ user }) => myWaitlist(user.id), { auth: true })
  .get(
    '/orgs/:id/sessions/:sessionId/waitlist',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'booking', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return sessionWaitlist(params.id, params.sessionId);
    },
    { auth: true }
  )
  .delete(
    '/orgs/:id/waitlist/:entryId',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'booking', 'cancel'))) return status(403, { message: 'No tienes permiso.' });
      const r = await removeFromWaitlist(params.id, params.entryId);
      if (hasError(r)) return status(404, { message: 'No encontrado.' });
      return r;
    },
    { auth: true }
  );
