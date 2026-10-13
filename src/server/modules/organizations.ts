import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { deleteOrganization } from '../db/account-deletion';
import { getVerification, requestVerification } from '../db/verification';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';
import {
  authorize,
  createOrganization,
  getMemberRole,
  getOrganizationDetail,
  listMyOrganizations,
  updateOrganization,
} from '../db/organizations';

const text = (max: number) => t.String({ maxLength: max });

const createErrors = {
  VERTICAL_NOT_AVAILABLE: 'Ese rubro no está disponible todavía.',
  ZONE_NOT_AVAILABLE: 'Esa zona no está disponible.',
  CITY_REQUIRED: 'Indica la ciudad o elige una colonia.',
  INVALID_TIMEZONE: 'Esa zona horaria no es válida.',
  INVALID_MAPS_URL: 'Pega un enlace de Google Maps válido (https://maps.app.goo.gl/… o google.com/maps/…).',
} as const;

/** Organizaciones del usuario autenticado. Cada ruta con `:id` verifica membresía y permiso en el servidor. */
export const organizationsModule = new Elysia({ name: 'organizations', prefix: '/orgs' })
  .use(authPlugin)
  .get('/', ({ user }) => listMyOrganizations(user.id), { auth: true })
  .post(
    '/',
    async ({ user, body, status }) => {
      const result = await createOrganization(user.id, body);
      if (hasError(result)) return status(422, { message: createErrors[result.error] });
      return result;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 80 }),
        type: t.Union([t.Literal('PERSONAL'), t.Literal('STUDIO')]),
        verticalId: t.Optional(text(64)),
        description: t.Optional(text(600)),
        phone: t.Optional(text(32)),
        instagram: t.Optional(text(64)),
        website: t.Optional(text(120)),
        timezone: t.Optional(text(64)),
        currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
        address: t.String({ minLength: 3, maxLength: 160 }),
        neighborhood: t.Optional(text(80)),
        city: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        zoneId: t.Optional(text(64)),
        mapsUrl: t.Optional(text(500)),
        roomName: t.String({ minLength: 1, maxLength: 60 }),
        roomCapacity: t.Integer({ minimum: 1, maximum: 10000 }),
      }),
    }
  )
  .get(
    '/:id',
    async ({ user, params, status }) => {
      // Cualquier miembro puede ver su organización; quien no lo es recibe 404 (no revelamos que existe).
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      const detail = await getOrganizationDetail(params.id);
      return detail ?? status(404, { message: 'No encontrada' });
    },
    { auth: true }
  )
  // Verificación para salir en Descubrir: requisitos pendientes y estado de la revisión.
  .get(
    '/:id/verification',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      return (await getVerification(params.id)) ?? status(404, { message: 'No encontrada' });
    },
    { auth: true }
  )
  .post(
    '/:id/verification',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update')))
        return status(403, { message: 'No tienes permiso para publicar esta organización.' });
      if (!(await allow(`verify-request:${params.id}`, 5, 60 * 60_000))) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const r = await requestVerification(user.id, params.id, body.message);
      if (hasError(r)) {
        if (r.error === 'ALREADY_PENDING') return status(409, { message: 'Tu solicitud ya está en revisión.' });
        if (r.error === 'ALREADY_APPROVED') return status(409, { message: 'Tu negocio ya está verificado.' });
        if (r.error === 'INCOMPLETE') return status(422, { message: `Antes de pedir la revisión completa: ${r.missing.join(', ')}.` });
        return status(404, { message: 'No encontrada' });
      }
      return r;
    },
    { auth: true, body: t.Object({ message: t.Optional(text(500)) }) }
  )
  /** Elimina la academia completa. Solo su propietario y escribiendo su nombre; es definitivo. */
  .delete(
    '/:id',
    async ({ user, params, body, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (role !== 'owner') return status(403, { message: 'Solo la persona propietaria puede eliminar la academia.' });
      if (!await allow(`delete-org:${user.id}`, 5, 10 * 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const r = await deleteOrganization(user.id, params.id, body.confirmName);
      if (hasError(r)) {
        if (r.error === 'NAME_MISMATCH') return status(422, { message: 'El nombre no coincide. Escríbelo exactamente como aparece.' });
        if (r.error === 'BILLING_FAILED')
          return status(502, { message: 'No pudimos cancelar tu suscripción. No se borró nada: inténtalo de nuevo en un momento.' });
        return status(404, { message: 'No encontrada' });
      }
      return r;
    },
    { auth: true, body: t.Object({ confirmName: t.String({ minLength: 1, maxLength: 120 }) }) }
  )
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update')))
        return status(403, { message: 'No tienes permiso para editar esta organización.' });
      const r = await updateOrganization(user.id, params.id, body);
      if ('error' in r) {
        if (r.error === 'INVALID_TIMEZONE') return status(422, { message: 'Esa zona horaria no es válida.' });
        if (r.error === 'NOT_VERIFIED')
          return status(409, { message: 'Para aparecer en Descubrir primero hay que verificar tu negocio. Pide la verificación desde tu perfil.' });
        return status(409, {
          message: `Tienes ${r.upcoming} ${r.upcoming === 1 ? 'clase próxima programada' : 'clases próximas programadas'}. Cambiar la zona horaria movería su hora: cancélalas o reprográmalas primero.`,
        });
      }
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        description: t.Optional(text(600)),
        phone: t.Optional(text(32)),
        instagram: t.Optional(text(64)),
        website: t.Optional(text(120)),
        timezone: t.Optional(text(64)),
        currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
        isPublished: t.Optional(t.Boolean()),
        cancelWindowHours: t.Optional(t.Integer({ minimum: 0, maximum: 168 })),
      }),
    }
  );
