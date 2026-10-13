import { and, eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { auth } from './index';

/**
 * Confirmación de identidad para acciones delicadas (eliminar la cuenta, traspasar una academia): con contraseña si la
 * cuenta tiene una; si entra solo con Google, exige haber iniciado sesión hace menos de 10 minutos.
 * Devuelve `null` si todo está bien, o el error HTTP que se debe responder.
 */
export async function confirmIdentity(
  userId: string,
  session: { createdAt: Date | string | number },
  password?: string
): Promise<null | { status: 403 | 422; body: { code?: string; message: string } }> {
  const credential = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')),
  });
  if (credential?.password) {
    if (!password) return { status: 422, body: { message: 'Escribe tu contraseña para confirmar.' } };
    const ok = await (await auth.$context).password.verify({ hash: credential.password, password });
    if (!ok) return { status: 403, body: { message: 'La contraseña no es correcta.' } };
    return null;
  }
  if (Date.now() - new Date(session.createdAt).getTime() > 10 * 60_000)
    return { status: 403, body: { code: 'REAUTH_REQUIRED', message: 'Por seguridad, cierra sesión y vuelve a entrar con Google; luego repite la acción.' } };
  return null;
}
