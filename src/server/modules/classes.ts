import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import {
  cancelSession,
  createService,
  editSeries,
  listSeries,
  listServices,
  listSessions,
  scheduleSessions,
  updateService,
  updateSession,
} from '../db/classes';
import { authorize, getMemberRole } from '../db/organizations';
import { hasError } from './result';

const text = (max: number) => t.String({ maxLength: max });

const scheduleBody = t.Object({
  roomId: text(64),
  instructorUserId: t.Optional(text(64)),
  capacity: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
  startTime: t.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  weekdays: t.Optional(t.Array(t.Integer({ minimum: 0, maximum: 6 }), { maxItems: 7 })),
  startDate: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  endDate: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
});

const serviceFields = {
  name: t.String({ minLength: 2, maxLength: 80 }),
  description: t.Optional(text(600)),
  kind: t.Optional(t.Union([t.Literal('GROUP'), t.Literal('PRIVATE'), t.Literal('WORKSHOP')])),
  disciplineId: t.Optional(text(64)),
  level: t.Optional(t.Union([t.Literal('ALL'), t.Literal('BEGINNER'), t.Literal('INTERMEDIATE'), t.Literal('ADVANCED')])),
  priceCents: t.Integer({ minimum: 0, maximum: 100_000_000 }),
  durationMin: t.Integer({ minimum: 10, maximum: 600 }),
  defaultCapacity: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
  instructorUserId: t.Optional(text(64)),
  bufferMin: t.Optional(t.Integer({ minimum: 0, maximum: 120 })),
};

const messages = {
  NOT_FOUND: [404, 'No encontrado.'],
  DISCIPLINE_INVALID: [422, 'Esa disciplina no pertenece al rubro de tu organización.'],
  ROOM_NOT_FOUND: [422, 'Elige un espacio de tu organización.'],
  INSTRUCTOR_INVALID: [422, 'Esa persona no puede impartir: debe ser del equipo como instructor, admin o propietario.'],
  CAPACITY_EXCEEDS_ROOM: [422, 'El cupo no puede superar la capacidad del espacio.'],
} as const;

type Failure =
  { error: keyof typeof messages } | { error: 'INVALID_SCHEDULE'; reason: string } | { error: 'CONFLICT'; conflicts: unknown[] };

function failure(f: Failure) {
  if (f.error === 'INVALID_SCHEDULE') return { code: 422 as const, body: { message: f.reason } };
  if (f.error === 'CONFLICT')
    return { code: 409 as const, body: { message: 'Hay choques de horario con otras sesiones.', conflicts: f.conflicts } };
  const [code, message] = messages[f.error];
  return { code, body: { message } };
}

/** Servicios (qué se vende) y sesiones (cuándo ocurre) de una organización. */
export const classesModule = new Elysia({ name: 'classes', prefix: '/orgs' })
  .use(authPlugin)
  .get(
    '/:id/services',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'service', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return listServices(params.id);
    },
    { auth: true }
  )
  .post(
    '/:id/services',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'service', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const { schedule, ...service } = body;
      if (schedule && !(await authorize(user.id, params.id, 'session', 'create')))
        return status(403, { message: 'No tienes permiso para programar sesiones.' });
      const r = await createService(user.id, params.id, service, schedule);
      if (hasError(r)) {
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    { auth: true, body: t.Object({ ...serviceFields, schedule: t.Optional(scheduleBody) }) }
  )
  .patch(
    '/:id/services/:serviceId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'service', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await updateService(user.id, params.id, params.serviceId, body);
      if (hasError(r)) {
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        description: t.Optional(text(600)),
        kind: serviceFields.kind,
        disciplineId: serviceFields.disciplineId,
        level: serviceFields.level,
        priceCents: t.Optional(t.Integer({ minimum: 0, maximum: 100_000_000 })),
        durationMin: t.Optional(t.Integer({ minimum: 10, maximum: 600 })),
        instructorUserId: serviceFields.instructorUserId,
        bufferMin: serviceFields.bufferMin,
        defaultCapacity: serviceFields.defaultCapacity,
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )
  .post(
    '/:id/services/:serviceId/sessions',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'create'))) return status(403, { message: 'No tienes permiso.' });
      const r = await scheduleSessions(user.id, params.id, params.serviceId, body);
      if (hasError(r)) {
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    { auth: true, body: scheduleBody }
  )
  .get(
    '/:id/sessions',
    async ({ user, params, query, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'read'))) return status(403, { message: 'No tienes permiso.' });
      const r = await listSessions(params.id, query.from, query.to);
      return r ?? status(422, { message: 'Rango de fechas inválido.' });
    },
    {
      auth: true,
      query: t.Object({ from: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }), to: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }) }),
    }
  )
  .patch(
    '/:id/sessions/:sessionId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await updateSession(user.id, params.id, params.sessionId, body);
      if (hasError(r)) {
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    {
      auth: true,
      body: t.Object({
        roomId: t.Optional(text(64)),
        instructorUserId: t.Optional(t.Union([text(64), t.Null()])),
        capacity: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        date: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
        startTime: t.Optional(t.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })),
      }),
    }
  )
  .post(
    '/:id/sessions/:sessionId/cancel',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'delete'))) return status(403, { message: 'No tienes permiso.' });
      const r = await cancelSession(user.id, params.id, params.sessionId, body.scope);
      if (hasError(r)) {
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    { auth: true, body: t.Object({ scope: t.Union([t.Literal('one'), t.Literal('following')]) }) }
  )
  .get(
    '/:id/services/:serviceId/series',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'read'))) return status(403, { message: 'No tienes permiso.' });
      return (await listSeries(params.id, params.serviceId)) ?? status(404, { message: 'No encontrada' });
    },
    { auth: true }
  )
  .patch(
    '/:id/series/:seriesId',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'session', 'update'))) return status(403, { message: 'No tienes permiso.' });
      // Quitar sesiones con reservas cancela esas reservas: además del permiso de editar se necesita el de cancelar.
      if (body.force && !(await authorize(user.id, params.id, 'booking', 'cancel')))
        return status(403, { message: 'No tienes permiso para cancelar reservas.' });
      const { dryRun, force, ...input } = body;
      const r = await editSeries(user.id, params.id, params.seriesId, input, { dryRun, force });
      if (hasError(r)) {
        if (r.error === 'HAS_BOOKINGS')
          return status(409, {
            message: 'Algunas sesiones que se quitarían ya tienen reservas.',
            code: 'HAS_BOOKINGS' as const,
            summary: (r as { summary: unknown }).summary,
          });
        const f = failure(r as Failure);
        return status(f.code, f.body);
      }
      return r;
    },
    {
      auth: true,
      body: t.Object({
        weekdays: t.Array(t.Integer({ minimum: 0, maximum: 6 }), { minItems: 1, maxItems: 7 }),
        startDate: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        endDate: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        startTime: t.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
        dryRun: t.Optional(t.Boolean()),
        force: t.Optional(t.Boolean()),
      }),
    }
  );
