import { unregisterPush } from '@/features/notifications/push';
import { authClient } from '@/lib/auth-client';

/** Cierra sesión y, antes, desregistra el teléfono de las push de esa cuenta (que la siguiente persona no vea sus avisos). */
export async function signOut() {
  await unregisterPush();
  return authClient.signOut();
}
