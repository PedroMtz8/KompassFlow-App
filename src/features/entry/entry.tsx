import { Redirect } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { useIsPlatformAdmin } from '@/features/admin/queries';
import { useActiveOrganization, useMyOrganizations } from '@/features/organizations/queries';
import { useSecurity } from '@/features/security/queries';
import { authClient } from '@/lib/auth-client';
import { useSpace, useSpaceHydrated } from '@/stores/space';

/**
 * Entrada de la app: con sesión lleva al lado donde estaba esa persona; sin sesión muestra `signedOut`
 * (en el celular redirige a iniciar sesión; en la web es la página de presentación).
 */
export function Entry({ signedOut }: { signedOut: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;
  if (!session) return <>{signedOut}</>;
  return <SignedInRedirect userId={session.user.id} />;
}

/**
 * La organización activa vive en la sesión del servidor y se pierde al cerrar sesión, así que aquí se recupera
 * la última que se guardó en el dispositivo (si la persona todavía pertenece a ella).
 */
function SignedInRedirect({ userId }: { userId: string }) {
  const security = useSecurity(true);
  const hydrated = useSpaceHydrated();
  const mode = useSpace((s) => s.mode);
  const remembered = useSpace((s) => s.last[userId]);
  const orgs = useMyOrganizations();
  const adminQ = useIsPlatformAdmin(true);
  const { activeId } = useActiveOrganization();
  // Resultado de la restauración y de qué persona es (si cambia la cuenta, se restaura otra vez).
  const [dest, setDest] = useState<{ userId: string; orgId: string | null; admin: boolean } | null>(null);
  const restored = dest?.userId === userId;

  useEffect(() => {
    if (!hydrated || restored || orgs.isPending || adminQ.isPending) return;
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
      if (orgs.data) remember(userId, admin ? 'admin' : target);
      setDest({ userId, orgId: target, admin });
    })();
  }, [hydrated, restored, orgs.isPending, orgs.data, adminQ.isPending, adminQ.data, remembered, mode, activeId, userId]);

  if (!hydrated || !restored) return null;
  // Cuenta con contraseña temporal: primero debe crear la suya.
  if (security.data?.mustChangePassword) return <Redirect href={'/force-password' as never} />;
  return <Redirect href={dest?.admin ? ('/overview' as never) : dest?.orgId ? '/today' : '/my-classes'} />;
}
