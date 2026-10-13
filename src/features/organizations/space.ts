import { router } from 'expo-router';

import { authClient } from '@/lib/auth-client';
import { useSpace } from '@/stores/space';

/** Guarda en qué lado quedó esta persona para volver ahí al recargar o al iniciar sesión de nuevo. */
async function remember(organizationId: string | null) {
  const { data } = await authClient.getSession();
  if (data?.user.id) useSpace.getState().remember(data.user.id, organizationId);
}

/** Entra a operar una organización: la marca activa en la sesión del servidor y abre su panel. */
export async function enterOrganization(organizationId: string) {
  await authClient.organization.setActive({ organizationId });
  await remember(organizationId);
  useSpace.getState().setMode('org');
  router.replace('/today');
}

/** Entra a la administración de la plataforma (sin academia activa). Solo la ofrece quien está en PLATFORM_ADMIN_EMAILS. */
export async function enterAdmin() {
  await authClient.organization.setActive({ organizationId: null });
  await remember('admin');
  useSpace.getState().setMode('admin');
  router.replace('/overview' as never);
}

/** Vuelve al lado alumno (sin organización activa). */
export async function enterStudentMode() {
  await authClient.organization.setActive({ organizationId: null });
  await remember(null);
  useSpace.getState().setMode('student');
  router.replace('/my-classes');
}

/** Etiqueta de un rol: los del sistema tienen la suya; un rol personalizado se muestra con su nombre. */
export const roleLabel = (role: string, instructorTerm = 'Instructor') =>
  ({ owner: 'PROPIETARIO', admin: 'ADMIN', instructor: instructorTerm.toUpperCase(), staff: 'STAFF' })[role] ?? role.toUpperCase();
