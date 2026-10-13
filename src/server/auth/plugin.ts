import { Elysia } from 'elysia';

import { isSuspended } from '../db/admin';
import { auth } from './index';

/**
 * Monta Better Auth en Elysia (`/api/auth/*`) y añade la macro `auth` para proteger rutas:
 *
 *   .get('/me', ({ user }) => user, { auth: true })
 */
/**
 * Con una contraseña temporal (cuenta creada por una academia) solo se puede ver el estado de seguridad y cambiar la
 * contraseña: todo lo demás responde 403 hasta que la persona la cambie. Se valida AQUÍ, en el servidor, para que no
 * se pueda saltar llamando a la API directo.
 */
const ALLOWED_WHILE_FORCED = ['/api/me/security', '/api/me/password/replace'];

export const authPlugin = new Elysia({ name: 'auth' }).mount(auth.handler).macro({
  auth: {
    async resolve({ status, request }) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401);
      // Cuenta suspendida por la administración: ninguna ruta autenticada responde (y sus sesiones ya se cerraron).
      if (await isSuspended(session.user.id))
        return status(403, { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida. Escríbenos si crees que es un error.' });
      if ((session.user as { mustChangePassword?: boolean }).mustChangePassword && !ALLOWED_WHILE_FORCED.includes(new URL(request.url).pathname))
        return status(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña para continuar.' });
      return { user: session.user, session: session.session };
    },
  },
});
