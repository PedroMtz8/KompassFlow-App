import { DEFAULT_TZ } from '@/lib/dates';

import { useActiveOrganization, useOrganization, useTeam } from '@/features/organizations/queries';

/** Datos de la organización activa que necesitan las pantallas de clases: espacios, instructores, zona horaria y vocabulario. */
export function useClassContext() {
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const team = useTeam(activeId);

  const rooms = (detail.data?.locations ?? []).flatMap((l) => l.rooms.map((r) => ({ ...r, locationAddress: l.address })));
  // Imparten: instructores, administradores y propietario (quien fundó el negocio también da clases).
  const instructors = (team.data?.members ?? []).filter((m) => ['instructor', 'admin', 'owner'].includes(m.role));

  return {
    activeId,
    org,
    tz: detail.data?.timezone ?? DEFAULT_TZ,
    currency: detail.data?.currency ?? 'MXN',
    terms: org?.terms,
    verticalId: org?.verticalId,
    rooms,
    instructors,
    isLoading: detail.isPending || team.isPending,
  };
}
