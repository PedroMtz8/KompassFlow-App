import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { backfillCardInfo } from '../db/connect';
import {
  grantPlan,
  isPlatformAdmin,
  listAudit,
  listOrgsForAdmin,
  listUsersForAdmin,
  reactivateUser,
  revokePlan,
  suspendUser,
  userDetailForAdmin,
 listPlansForAdmin, orgDetailForAdmin, platformOverview, resetPlan, updatePlan } from '../db/admin';
import {
  approveVerification,
  listVerifications,
  rejectVerification,
  verificationCounts,
  verificationDetail,
} from '../db/verification';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

const errors = {
  NOT_FOUND: [404, 'Plan no encontrado.'],
  FREE_PLAN: [422, 'El plan Gratis no tiene precio ni prueba.'],
  NO_STRIPE_PRICE: [409, 'Este plan aún no tiene precio en Stripe: créalo primero (bun scripts/stripe-setup.ts).'],
  STRIPE_FAILED: [502, 'Stripe no pudo crear el precio nuevo. Inténtalo de nuevo.'],
} as const;

const limit = t.Union([t.Null(), t.Integer({ minimum: 1, maximum: 1_000_000 })]);

/** Administración de la plataforma: planes, límites y comisiones. Solo para quienes están en `PLATFORM_ADMIN_EMAILS` (con correo confirmado). */
export const adminModule = new Elysia({ name: 'admin', prefix: '/admin' })
  .use(authPlugin)
  .get('/me', ({ user }) => ({ admin: isPlatformAdmin(user) }), { auth: true })
  .get(
    '/plans',
    async ({ user, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return listPlansForAdmin();
    },
    { auth: true }
  )
  .get(
    '/overview',
    async ({ user, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return platformOverview();
    },
    { auth: true }
  )
  .get(
    '/orgs',
    async ({ user, query, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return listOrgsForAdmin({ q: query.q, limit: query.limit, offset: query.offset });
    },
    {
      auth: true,
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    }
  )
  .get(
    '/orgs/:id',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return (await orgDetailForAdmin(params.id)) ?? status(404, { message: 'No encontrado' });
    },
    { auth: true }
  )
  .get(
    '/users',
    async ({ user, query, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return listUsersForAdmin({ q: query.q, limit: query.limit, offset: query.offset });
    },
    {
      auth: true,
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    }
  )
  .get(
    '/users/:id',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return (await userDetailForAdmin(params.id)) ?? status(404, { message: 'No encontrado' });
    },
    { auth: true }
  )
  .post(
    '/users/:id/suspend',
    async ({ user, params, body, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await suspendUser(user.id, params.id, body.reason);
      if (hasError(r)) {
        if (r.error === 'PROTECTED') return status(409, { message: 'No puedes suspender a un administrador ni a tu propia cuenta.' });
        return status(404, { message: 'No encontrado' });
      }
      return userDetailForAdmin(params.id);
    },
    { auth: true, body: t.Object({ reason: t.String({ minLength: 5, maxLength: 300 }) }) }
  )
  .post(
    '/users/:id/reactivate',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await reactivateUser(user.id, params.id);
      if (hasError(r)) return status(404, { message: 'Esta cuenta no está suspendida.' });
      return userDetailForAdmin(params.id);
    },
    { auth: true }
  )
  .get(
    '/audit',
    async ({ user, query, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return listAudit({ prefix: query.prefix, limit: query.limit, offset: query.offset });
    },
    {
      auth: true,
      query: t.Object({
        prefix: t.Optional(t.String({ maxLength: 40 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    }
  )
  // Plan otorgado a mano a una academia (cortesía o prueba extendida).
  .put(
    '/orgs/:id/plan',
    async ({ user, params, body, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await grantPlan(user.id, params.id, { plan: body.plan, days: body.days, note: body.note });
      if (hasError(r)) return status(404, { message: r.error === 'PLAN_NOT_FOUND' ? 'Plan no encontrado.' : 'Academia no encontrada.' });
      return orgDetailForAdmin(params.id);
    },
    {
      auth: true,
      body: t.Object({
        plan: t.String({ maxLength: 20 }),
        // null = sin vencimiento.
        days: t.Union([t.Null(), t.Integer({ minimum: 1, maximum: 730 })]),
        note: t.Optional(t.String({ maxLength: 300 })),
      }),
    }
  )
  .delete(
    '/orgs/:id/plan',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await revokePlan(user.id, params.id);
      if (hasError(r)) return status(404, { message: 'Esta academia no tiene un plan otorgado.' });
      return orgDetailForAdmin(params.id);
    },
    { auth: true }
  )
  // Verificación de negocios antes de publicarse en Descubrir.
  .get(
    '/verifications',
    async ({ user, query, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return listVerifications({ status: query.status, limit: query.limit, offset: query.offset });
    },
    {
      auth: true,
      query: t.Object({
        status: t.Union([t.Literal('PENDING'), t.Literal('APPROVED'), t.Literal('REJECTED'), t.Literal('NONE')]),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    }
  )
  .get(
    '/verifications/counts',
    async ({ user, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return verificationCounts();
    },
    { auth: true }
  )
  .get(
    '/verifications/:id',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      return (await verificationDetail(params.id)) ?? status(404, { message: 'No encontrado' });
    },
    { auth: true }
  )
  .post(
    '/verifications/:id/approve',
    async ({ user, params, body, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await approveVerification(user.id, params.id, body);
      if (hasError(r)) return r.error === 'NOT_FOUND' ? status(404, { message: 'No encontrado' }) : status(409, { message: 'Esta solicitud ya no está pendiente.' });
      return verificationDetail(params.id);
    },
    {
      auth: true,
      body: t.Object({
        method: t.Union([t.Literal('WEBSITE'), t.Literal('SOCIAL'), t.Literal('PHONE'), t.Literal('OTHER')]),
        note: t.Optional(t.String({ maxLength: 500 })),
      }),
    }
  )
  .post(
    '/verifications/:id/reject',
    async ({ user, params, body, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await rejectVerification(user.id, params.id, body);
      if (hasError(r)) return r.error === 'NOT_FOUND' ? status(404, { message: 'No encontrado' }) : status(409, { message: 'Esta organización no está en revisión ni aprobada.' });
      return verificationDetail(params.id);
    },
    { auth: true, body: t.Object({ reason: t.String({ minLength: 5, maxLength: 500 }), note: t.Optional(t.String({ maxLength: 500 })) }) }
  )
  // Completa el tipo de tarjeta (crédito/débito) de pagos anteriores consultando a Stripe.
  .post(
    '/card-info/backfill',
    async ({ user, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      if (!(await allow(`admin-backfill:${user.id}`, 6, 10 * 60_000))) return status(429, { message: 'Espera un momento.' });
      return backfillCardInfo(50);
    },
    { auth: true }
  )
  .put(
    '/plans/:plan',
    async ({ user, params, body, status }) => {
      // Para quien no es administrador la ruta «no existe»: no se revela que hay un panel.
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      if (!(await allow(`admin:${user.id}`, 60, 10 * 60_000))) return status(429, { message: 'Demasiados cambios seguidos. Espera un momento.' });
      const r = await updatePlan(user.id, params.plan, body);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return listPlansForAdmin();
    },
    {
      auth: true,
      body: t.Object({
        priceMxn: t.Optional(t.Integer({ minimum: 1, maximum: 100_000 })),
        trialDays: t.Optional(t.Integer({ minimum: 0, maximum: 90 })),
        maxStudents: t.Optional(limit),
        maxMembers: t.Optional(limit),
        maxLocations: t.Optional(limit),
        reports: t.Optional(t.Boolean()),
        // Hasta 30%: un tope para que un error de dedo no deje cobros absurdos.
        cardFeeBps: t.Optional(t.Integer({ minimum: 0, maximum: 3000 })),
      }),
    }
  )
  .post(
    '/plans/:plan/reset',
    async ({ user, params, status }) => {
      if (!isPlatformAdmin(user)) return status(404, { message: 'No encontrado' });
      const r = await resetPlan(user.id, params.plan);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return listPlansForAdmin();
    },
    { auth: true }
  );
