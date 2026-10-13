import { Elysia, t } from 'elysia';

import { hasFeature } from '../db/billing';
import { authPlugin } from '../auth/plugin';
import { closeAttendance, getAttendance, markAttendance, reopenAttendance, reportSummary } from '../db/attendance';
import { authorize, getMemberRole } from '../db/organizations';
import { hasError } from './result';

const errors = {
  NOT_FOUND: [404, 'No encontrado.'],
  CANCELED: [409, 'La sesión está cancelada.'],
  TOO_EARLY: [409, 'Todavía es pronto: el pase de lista se abre 1 hora antes de que empiece la clase.'],
  NOT_YOUR_SESSION: [403, 'Solo puedes pasar lista en las sesiones que impartes.'],
} as const;

/** Pase de lista de una sesión y reportes. Se evalúa membresía, permiso y (para instructores) que la sesión sea suya. */
export const attendanceModule = new Elysia({ name: 'attendance', prefix: '/orgs' })
  .use(authPlugin)
  .get(
    '/:id/sessions/:sessionId/attendance',
    async ({ user, params, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'attendance', 'read'))) return status(403, { message: 'No tienes permiso.' });
      const r = await getAttendance(params.id, params.sessionId, { userId: user.id, role });
      if (!r) return status(404, { message: 'No encontrada' });
      return r;
    },
    { auth: true }
  )
  .put(
    '/:id/sessions/:sessionId/attendance/:bookingId',
    async ({ user, params, body, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'attendance', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await markAttendance({ userId: user.id, role }, params.id, params.sessionId, params.bookingId, body.status);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true, body: t.Object({ status: t.Union([t.Literal('PRESENT'), t.Literal('ABSENT'), t.Null()]) }) }
  )
  .post(
    '/:id/sessions/:sessionId/attendance/close',
    async ({ user, params, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'attendance', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await closeAttendance({ userId: user.id, role }, params.id, params.sessionId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .post(
    '/:id/sessions/:sessionId/attendance/reopen',
    async ({ user, params, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'attendance', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await reopenAttendance({ userId: user.id, role }, params.id, params.sessionId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .get(
    '/:id/reports/summary',
    async ({ user, params, query, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'report', 'read'))) return status(403, { message: 'No tienes permiso para ver reportes.' });
      if (!(await hasFeature(params.id, 'reports'))) return status(402, { message: 'Los reportes están disponibles desde el plan Pro.' });
      return reportSummary(params.id, query.days ?? 30);
    },
    { auth: true, query: t.Object({ days: t.Optional(t.Numeric({ minimum: 7, maximum: 365 })) }) }
  );
