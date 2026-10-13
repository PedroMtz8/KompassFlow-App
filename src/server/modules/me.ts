import { and, eq, ne } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { auth } from '../auth';
import { authPlugin } from '../auth/plugin';
import { db, schema } from '../db';
import { deleteAccount } from '../db/account-deletion';
import { env } from '../env';
import { confirmIdentity } from '../auth/reauth';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';

/** Cuentas vinculadas a la persona: ¿ya tiene contraseña? ¿con qué proveedores entra? */
async function linkedProviders(userId: string) {
  const rows = await db.select({ providerId: schema.account.providerId }).from(schema.account).where(eq(schema.account.userId, userId));
  const providers = rows.map((r) => r.providerId);
  return { hasPassword: providers.includes('credential'), providers, googleAvailable: !!env.google };
}

export const meModule = new Elysia({ name: 'me' })
  .use(authPlugin)
  /** Ejemplo de ruta protegida: devuelve el usuario y la sesión activa. */
  .get('/me', ({ user, session }) => ({ user, session }), { auth: true })
  .get(
    '/me/security',
    async ({ user }) => {
      const u = user as { mustChangePassword?: boolean; tempPasswordExpiresAt?: Date | string | number | null };
      const expiresAt = u.tempPasswordExpiresAt ? new Date(u.tempPasswordExpiresAt) : null;
      return {
        ...(await linkedProviders(user.id)),
        // Cuenta creada por una academia: debe cambiar la contraseña temporal (o pedir otra si caducó).
        mustChangePassword: !!u.mustChangePassword,
        credentialsExpired: !!u.mustChangePassword && !!expiresAt && expiresAt.getTime() < Date.now(),
      };
    },
    { auth: true }
  )
  /** Cambio obligatorio de la contraseña temporal. Cierra las demás sesiones: quien creó la cuenta pierde el acceso. */
  .post(
    '/me/password/replace',
    async ({ user, session, body, request, status }) => {
      if (!await allow(`password-replace:${user.id}`, 8, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const u = user as { mustChangePassword?: boolean; tempPasswordExpiresAt?: Date | string | number | null };
      if (!u.mustChangePassword) return status(409, { message: 'Tu cuenta no necesita este cambio.' });
      if (u.tempPasswordExpiresAt && new Date(u.tempPasswordExpiresAt).getTime() < Date.now())
        return status(403, { code: 'CREDENTIALS_EXPIRED', message: 'Tus credenciales caducaron. Pide unas nuevas a tu academia.' });
      if (body.currentPassword === body.newPassword) return status(422, { message: 'La nueva contraseña debe ser distinta a la temporal.' });
      try {
        await auth.api.changePassword({
          body: { currentPassword: body.currentPassword, newPassword: body.newPassword, revokeOtherSessions: false },
          headers: request.headers,
        });
      } catch (e) {
        const code = (e as { body?: { code?: string } }).body?.code;
        if (code === 'INVALID_PASSWORD') return status(400, { message: 'La contraseña temporal no es correcta.' });
        if (code === 'PASSWORD_TOO_SHORT') return status(422, { message: 'La contraseña debe tener al menos 8 caracteres.' });
        if (code === 'PASSWORD_TOO_LONG') return status(422, { message: 'La contraseña es demasiado larga.' });
        return status(400, { message: 'No se pudo cambiar la contraseña.' });
      }
      // Se cierran las demás sesiones a mano (la actual se conserva: si lo hiciera Better Auth emitiría una cookie nueva
      // que esta respuesta no reenvía). Así quien creó la cuenta y guardó las credenciales pierde el acceso.
      await db.batch([
        db.delete(schema.session).where(and(eq(schema.session.userId, user.id), ne(schema.session.id, session.id))),
        db.update(schema.user).set({ mustChangePassword: false, tempPasswordExpiresAt: null }).where(eq(schema.user.id, user.id)),
        db.insert(schema.auditLog).values({
          organizationId: null,
          actorUserId: user.id,
          action: 'user.password_activated',
          entityType: 'user',
          entityId: user.id,
        }),
      ]);
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ currentPassword: t.String({ minLength: 1, maxLength: 128 }), newPassword: t.String({ minLength: 1, maxLength: 128 }) }) }
  )
  /**
   * Define una contraseña para una cuenta que entró con Google y aún no tiene una (así también puede
   * entrar con correo y contraseña, p. ej. en Expo Go). Better Auth sólo permite `setPassword` en el servidor.
   * Si ya tiene contraseña, se cambia desde el cliente con `changePassword` (pide la actual).
   */
  .post(
    '/me/password',
    async ({ user, body, request, status }) => {
      if (!await allow(`password:${user.id}`, 5, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      if ((await linkedProviders(user.id)).hasPassword)
        return status(409, { message: 'Tu cuenta ya tiene contraseña. Usa «Cambiar contraseña».' });
      try {
        await auth.api.setPassword({ body: { newPassword: body.newPassword }, headers: request.headers });
      } catch (e) {
        const code = (e as { body?: { code?: string } }).body?.code;
        if (code === 'PASSWORD_TOO_SHORT') return status(422, { message: 'La contraseña debe tener al menos 8 caracteres.' });
        if (code === 'PASSWORD_TOO_LONG') return status(422, { message: 'La contraseña es demasiado larga.' });
        return status(400, { message: 'No se pudo definir la contraseña.' });
      }
      await db.insert(schema.auditLog).values({
        organizationId: null,
        actorUserId: user.id,
        action: 'user.password_set',
        entityType: 'user',
        entityId: user.id,
      });
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ newPassword: t.String({ minLength: 1, maxLength: 128 }) }) }
  )
  /**
   * Elimina la cuenta de quien la pide. Exige confirmar la identidad (la contraseña, o una sesión recién iniciada si entra solo
   * con Google) y escribir ELIMINAR. Si es la única propietaria de alguna academia, se bloquea y se dice cuáles.
   */
  .post(
    '/me/delete',
    async ({ user, session, body, status }) => {
      if (!await allow(`delete-account:${user.id}`, 5, 10 * 60_000))
        return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      if (body.confirm.trim().toUpperCase() !== 'ELIMINAR') return status(422, { message: 'Escribe ELIMINAR para confirmar.' });

      const denied = await confirmIdentity(user.id, session, body.password);
      if (denied) return status(denied.status, denied.body);

      const r = await deleteAccount(user.id);
      if (hasError(r)) {
        if (r.error === 'OWNS_ORGANIZATIONS')
          return status(409, {
            code: 'OWNS_ORGANIZATIONS',
            message: `Eres la única persona propietaria de ${r.organizations.map((o) => `«${o.name}»`).join(', ')}. Traspásala a otra persona del equipo (Equipo → su perfil → Traspasar la academia) o elimínala (Editar negocio → Eliminar academia) antes de borrar tu cuenta.`,
            organizations: r.organizations,
          });
        return status(404, { message: 'No encontrada.' });
      }
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ confirm: t.String({ maxLength: 20 }), password: t.Optional(t.String({ maxLength: 128 })) }) }
  );
