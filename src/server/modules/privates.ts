import { Elysia, t } from 'elysia';

import { userCan } from '../auth/access';
import { authPlugin } from '../auth/plugin';
import { bookPrivateSlot, getAvailability, listSlots, setAvailability } from '../db/privates';
import { getMemberRole } from '../db/organizations';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

const window = t.Object({
  weekday: t.Integer({ minimum: 0, maximum: 6 }),
  startTime: t.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  endTime: t.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
});

// Quien imparte (rol con `session:teach`) administra SU disponibilidad.

/** Clases privadas: disponibilidad de quien imparte y reserva de horarios. */
export const privatesModule = new Elysia({ name: 'privates' })
  .use(authPlugin)
  .get(
    '/orgs/:id/availability',
    async ({ user, params, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await userCan(params.id, user.id, 'session', 'teach'))) return status(403, { message: 'No tienes permiso.' });
      return { windows: await getAvailability(params.id, user.id) };
    },
    { auth: true }
  )
  .put(
    '/orgs/:id/availability',
    async ({ user, params, body, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await userCan(params.id, user.id, 'session', 'teach'))) return status(403, { message: 'No tienes permiso.' });
      const r = await setAvailability(user.id, params.id, user.id, body.windows);
      if (hasError(r)) return status(422, { message: r.reason });
      return r;
    },
    { auth: true, body: t.Object({ windows: t.Array(window, { maxItems: 60 }) }) }
  )
  .get(
    '/discover/services/:id/slots',
    async ({ params, status }) => (await listSlots(params.id)) ?? status(404, { message: 'No encontrada' }),
    { auth: true }
  )
  .post(
    '/discover/services/:id/book-slot',
    async ({ user, params, body, status }) => {
      if (!await allow(`bookslot:${user.id}`, 30, 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await bookPrivateSlot(user, params.id, body.startsAt);
      if (hasError(r)) {
        return r.error === 'NOT_FOUND'
          ? status(404, { message: 'No encontrada' })
          : status(409, { message: 'Ese horario ya no está disponible. Elige otro.' });
      }
      return r;
    },
    { auth: true, body: t.Object({ startsAt: t.Integer() }) }
  );
