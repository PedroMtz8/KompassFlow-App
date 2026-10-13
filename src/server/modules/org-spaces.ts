import { Elysia, t } from 'elysia';

import { checkLimit } from '../db/billing';
import { authPlugin } from '../auth/plugin';
import { hasError } from './result';
import { authorize, getMemberRole } from '../db/organizations';
import { createLocation, createRoom, deleteRoom, updateLocation, updateRoom } from '../db/spaces';

const text = (max: number) => t.String({ maxLength: max });

const errors = {
  NOT_FOUND: [404, 'No encontrado.'],
  ZONE_NOT_AVAILABLE: [422, 'Esa zona no está disponible.'],
  CITY_REQUIRED: [422, 'Indica la ciudad o elige una colonia.'],
  INVALID_MAPS_URL: [422, 'Pega un enlace de Google Maps válido (https://maps.app.goo.gl/… o google.com/maps/…).'],
  DUPLICATE_NAME: [409, 'Ya existe un espacio con ese nombre en esta sede.'],
} as const;

/** Sedes y salones/áreas de una organización. Toda ruta verifica membresía y permiso en el servidor. */
export const orgSpacesModule = new Elysia({ name: 'org-spaces', prefix: '/orgs' })
  .use(authPlugin)
  .post(
    '/:id/locations',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'location', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const limit = await checkLimit(params.id, 'locations');
      if (!limit.ok) return status(402, { message: limit.message });
      const r = await createLocation(user.id, params.id, body);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        address: t.String({ minLength: 3, maxLength: 160 }),
        neighborhood: t.Optional(text(80)),
        city: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        zoneId: t.Optional(text(64)),
        mapsUrl: t.Optional(text(500)),
      }),
    }
  )
  .patch(
    '/:id/locations/:locationId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'location', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await updateLocation(user.id, params.id, params.locationId, body);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        address: t.Optional(t.String({ minLength: 3, maxLength: 160 })),
        neighborhood: t.Optional(text(80)),
        city: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        zoneId: t.Optional(text(64)),
        mapsUrl: t.Optional(text(500)),
      }),
    }
  )
  .post(
    '/:id/locations/:locationId/rooms',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'location', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const r = await createRoom(user.id, params.id, params.locationId, body);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        capacity: t.Integer({ minimum: 1, maximum: 10000 }),
        note: t.Optional(text(120)),
      }),
    }
  )
  .patch(
    '/:id/rooms/:roomId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'location', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await updateRoom(user.id, params.id, params.roomId, body);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
        capacity: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        note: t.Optional(text(120)),
      }),
    }
  )
  .delete(
    '/:id/rooms/:roomId',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'location', 'delete'))) return status(403, { message: 'No tienes permiso.' });
      const r = await deleteRoom(user.id, params.id, params.roomId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  );
