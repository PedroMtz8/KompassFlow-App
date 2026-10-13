import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { getCatalog, getUserInterests, saveUserInterests } from '../db/catalog';

/** Catálogo de rubros/disciplinas e intereses del usuario autenticado. */
export const interestsModule = new Elysia({ name: 'interests' })
  .use(authPlugin)
  .get('/catalog', () => getCatalog(), { auth: true })
  .get('/me/interests', ({ user }) => getUserInterests(user.id), { auth: true })
  .put(
    '/me/interests',
    ({ user, body }) => saveUserInterests(user.id, { verticalIds: body.verticalIds ?? [], disciplineIds: body.disciplineIds }),
    {
      auth: true,
      body: t.Object({
        verticalIds: t.Optional(t.Array(t.String(), { maxItems: 20 })),
        disciplineIds: t.Array(t.String(), { maxItems: 100 }),
      }),
    }
  );
