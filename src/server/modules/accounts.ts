import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { createManagedAccount, resetManagedAccount } from '../db/accounts';
import { checkLimit } from '../db/billing';
import { authorize, getMemberRole } from '../db/organizations';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

const errors = {
  EMAIL_EXISTS: [409, 'Ese correo ya tiene cuenta. Invítala o dale un código de vinculación.'],
  ONLY_OWNER_CAN_GRANT_ADMIN: [403, 'Solo el propietario puede dar el rol de administrador.'],
  NOT_FOUND: [404, 'No encontrada.'],
  ALREADY_ACTIVATED: [409, 'Esta persona ya activó su cuenta con su propia contraseña: nadie más puede restablecerla.'],
  ALREADY_MEMBER: [409, 'Ya es parte de la academia.'],
  INVALID_ROLE: [422, 'Ese rol no existe en tu organización.'],
  ROLE_EXCEEDS_YOURS: [403, 'No puedes asignar un rol con más permisos de los que tú tienes.'],
} as const;

/** Cuentas con contraseña temporal creadas por la academia (alumnos y personal). */
export const accountsModule = new Elysia({ name: 'accounts' })
  .use(authPlugin)
  .post(
    '/orgs/:id/accounts',
    async ({ user, params, body, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      const staff = body.kind === 'staff';
      if (!(await authorize(user.id, params.id, staff ? 'invitation' : 'student', 'create')))
        return status(403, { message: 'No tienes permiso para crear cuentas.' });
      if (!await allow(`account:${user.id}`, 20, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const limit = await checkLimit(params.id, staff ? 'members' : 'students');
      if (!limit.ok) return status(402, { message: limit.message });
      if (staff && !body.role) return status(422, { message: 'Elige un rol.' });
      const r = await createManagedAccount(
        { userId: user.id, role },
        params.id,
        staff ? { name: body.name, email: body.email, kind: 'staff', role: body.role! } : { name: body.name, email: body.email, kind: 'student' }
      );
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        kind: t.Union([t.Literal('student'), t.Literal('staff')]),
        name: t.String({ minLength: 2, maxLength: 100 }),
        email: t.String({ format: 'email', maxLength: 160 }),
        role: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
      }),
    }
  )
  .post(
    '/orgs/:id/accounts/:userId/reset',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      // Mismo permiso que para crearla: quien puede invitar personal o dar de alta alumnos.
      const allowed =
        (await authorize(user.id, params.id, 'invitation', 'create')) || (await authorize(user.id, params.id, 'student', 'create'));
      if (!allowed) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`account-reset:${user.id}`, 10, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const r = await resetManagedAccount(user.id, params.id, params.userId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  );
