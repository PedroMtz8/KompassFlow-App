import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useIsPlatformAdmin } from '@/features/admin/queries';
import { useActiveOrganization, useMyOrganizations } from '@/features/organizations/queries';
import { useSecurity } from '@/features/security/queries';
import { authClient } from '@/lib/auth-client';
import { useSpace, useSpaceHydrated } from '@/stores/space';

/**
 * Entrada: sin sesión => iniciar sesión; con sesión => el lado donde estaba esa persona (alumno u organización).
 * La organización activa vive en la sesión del servidor y se pierde al cerrar sesión, así que aquí se recupera
 * la última que se guardó en el dispositivo (si la persona todavía pertenece a ella).
 */
export default function Index() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;
  const security = useSecurity(!!session);
  const hydrated = useSpaceHydrated();
  const mode = useSpace((s) => s.mode);
  const remembered = useSpace((s) => (userId ? s.last[userId] : undefined));
  const orgs = useMyOrganizations();
  const adminQ = useIsPlatformAdmin(!!session);
  const { activeId } = useActiveOrganization();
  // Resultado de la restauración y de qué persona es (si cambia la cuenta, se restaura otra vez).
  const [dest, setDest] = useState<{ userId: string; orgId: string | null; admin: boolean } | null>(null);
  const restored = !!userId && dest?.userId === userId;

  useEffect(() => {
    if (!session || !hydrated || restored || orgs.isPending || adminQ.isPending) return;
    // La academia que la sesión del servidor tiene activa manda (es la que ve la persona como «seleccionada»); solo si no hay
    // ninguna (p. ej. tras cerrar sesión) se recupera el último espacio guardado en este dispositivo.
    const saved = activeId ?? (remembered !== undefined ? remembered : mode === 'admin' ? 'admin' : null);
    const admin = saved === 'admin' && !!adminQ.data;
    const target = !admin && saved && orgs.data?.some((o) => o.id === saved) ? saved : null;
    (async () => {
      if (target && activeId !== target) await authClient.organization.setActive({ organizationId: target });
      else if (!target && activeId) await authClient.organization.setActive({ organizationId: null }); // ya no pertenece a esa academia
      const { setMode, remember } = useSpace.getState();
      setMode(admin ? 'admin' : target ? 'org' : 'student');
      // Si la lista de organizaciones no cargó (sin red) no se pisa lo guardado.
      if (userId && orgs.data) remember(userId, admin ? 'admin' : target);
      if (userId) setDest({ userId, orgId: target, admin });
    })();
  }, [session, hydrated, restored, orgs.isPending, orgs.data, adminQ.isPending, adminQ.data, remembered, mode, activeId, userId]);

  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (!hydrated || !restored) return null;
  // Cuenta con contraseña temporal: primero debe crear la suya.
  if (security.data?.mustChangePassword) return <Redirect href={"/force-password" as never} />;
  return <Redirect href={dest?.admin ? ('/overview' as never) : dest?.orgId ? '/today' : '/my-classes'} />;
}
