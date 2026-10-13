import { Elysia } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { getBilling } from '../db/billing';
import { authorize, getMemberRole } from '../db/organizations';

/**
 * Plan de la organización. Contratar, cambiar o cancelar pasa por las rutas del plugin de Stripe
 * (`/api/auth/subscription/*`), que sólo autorizan al propietario.
 */
export const billingModule = new Elysia({ name: 'billing', prefix: '/orgs' }).use(authPlugin).get(
  '/:id/billing',
  async ({ user, params, status }) => {
    if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
    if (!(await authorize(user.id, params.id, 'plan', 'read'))) return status(403, { message: 'No tienes permiso.' });
    return getBilling(params.id);
  },
  { auth: true }
);
