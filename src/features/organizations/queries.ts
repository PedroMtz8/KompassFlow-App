import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { localDateOf } from '@/lib/dates';

export const orgsKey = ['orgs'] as const;
export const orgKey = (id: string) => ['orgs', id] as const;

export type Terms = { room: string; rooms: string; instructor: string; instructors: string; session: string };

/** Organizaciones a las que pertenece el usuario (con su rol y rubro). */
export function useMyOrganizations() {
  return useQuery({
    queryKey: orgsKey,
    queryFn: async () => {
      const { data, error } = await api.orgs.get();
      // Si el servidor responde algo que no es la lista (p. ej. una página de error), se trata como fallo, no como datos.
      if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar tus espacios');
      return data;
    },
  });
}

export type MyOrganization = NonNullable<ReturnType<typeof useMyOrganizations>['data']>[number];

export function useOrganization(id: string | null | undefined) {
  return useQuery({
    queryKey: orgKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar la organización');
      return data;
    },
  });
}

export type CreateOrganizationInput = Parameters<typeof api.orgs.post>[0];

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      const { data, error } = await api.orgs.post(input);
      if (error) {
        const message = (error.value as { message?: string } | undefined)?.message;
        throw new Error(message ?? 'No se pudo crear la organización');
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orgsKey }),
  });
}

export type UpdateOrganizationInput = Parameters<ReturnType<typeof api.orgs>['patch']>[0];

export function useUpdateOrganization(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationInput) => {
      const { error } = await api.orgs({ id }).patch(input);
      if (error) {
        const message = (error.value as { message?: string } | undefined)?.message;
        throw new Error(message ?? 'No se pudieron guardar los cambios');
      }
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: orgsKey }), qc.invalidateQueries({ queryKey: ['discover'] })]),
  });
}

/** Organización activa según la sesión (Better Auth guarda `activeOrganizationId` en el servidor). */
export function useActiveOrganization() {
  const { data: session } = authClient.useSession();
  const activeId = (session?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null;
  const orgs = useMyOrganizations();
  const org = orgs.data?.find((o) => o.id === activeId) ?? null;
  return { activeId, org, isPending: orgs.isPending };
}

/* ── Zonas (ciudades y colonias) ─────────────────────────────────────────── */

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.zones.get();
      if (error) throw new Error('No se pudieron cargar las zonas');
      return data;
    },
  });
}

/* ── Sedes y salones ─────────────────────────────────────────────────────── */

const fail = (error: { value?: unknown } | null | undefined, fallback: string) => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

export function useRoomMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId) });
  return {
    create: useMutation({
      mutationFn: async (v: { locationId: string; name: string; capacity: number; note?: string }) => {
        const { locationId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).locations({ locationId }).rooms.post(body);
        if (error) fail(error, 'No se pudo crear');
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: { roomId: string; name?: string; capacity?: number; note?: string }) => {
        const { roomId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).rooms({ roomId }).patch(body);
        if (error) fail(error, 'No se pudo guardar');
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (roomId: string) => {
        const { error } = await api.orgs({ id: orgId }).rooms({ roomId }).delete();
        if (error) fail(error, 'No se pudo eliminar');
      },
      onSuccess: refresh,
    }),
  };
}

/* ── Equipo e invitaciones ───────────────────────────────────────────────── */

export const teamKey = (orgId: string) => ['orgs', orgId, 'team'] as const;
export const myInvitationsKey = ['me', 'invitations'] as const;
/** Rol del sistema (admin, instructor, staff) o el identificador de un rol personalizado. */
export type AssignableRole = string;

export function useTeam(orgId: string | null | undefined) {
  return useQuery({
    queryKey: teamKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).team.get();
      if (error) throw new Error('No se pudo cargar el equipo');
      return data;
    },
  });
}

/** Traspasa la academia a otra persona del equipo (pide la contraseña o una sesión reciente). */
export function useTransferOwnership(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { memberId: string; password?: string }) => {
      const { error } = await api.orgs({ id: orgId })['transfer-ownership'].post(v);
      if (error) fail(error, 'No se pudo traspasar la academia');
    },
    // Cambian mi rol y mis permisos en todas partes.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: orgsKey }), qc.invalidateQueries({ queryKey: ['orgs', orgId] })]),
  });
}

/** Antes de quitar a alguien: cuántas clases próximas imparte y quién más puede tomarlas. */
export function useRemovalPreview(orgId: string | null | undefined, memberId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...teamKey(orgId ?? ''), 'removal', memberId ?? ''],
    enabled: enabled && !!orgId && !!memberId,
    // Es una foto del momento de quitar: no se reutiliza una anterior.
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).members({ memberId: memberId! })['removal-preview'].get();
      if (error || !data) throw new Error('No se pudo revisar sus clases');
      return data;
    },
  });
}

export function useTeamMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: teamKey(orgId) });
  return {
    invite: useMutation({
      mutationFn: async (v: { email: string; role: AssignableRole }) => {
        const { error } = await api.orgs({ id: orgId }).invitations.post(v);
        if (error) fail(error, 'No se pudo invitar');
      },
      onSuccess: refresh,
    }),
    cancelInvite: useMutation({
      mutationFn: async (invitationId: string) => {
        const { error } = await api.orgs({ id: orgId }).invitations({ invitationId }).delete();
        if (error) fail(error, 'No se pudo cancelar');
      },
      onSuccess: refresh,
    }),
    changeRole: useMutation({
      mutationFn: async (v: { memberId: string; role: AssignableRole }) => {
        const { error } = await api.orgs({ id: orgId }).members({ memberId: v.memberId }).patch({ role: v.role });
        if (error) fail(error, 'No se pudo cambiar el rol');
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (v: { memberId: string; reassignTo?: string }) => {
        const { data, error } = await api.orgs({ id: orgId }).members({ memberId: v.memberId }).delete(undefined, { query: { reassignTo: v.reassignTo } });
        if (error || !data) fail(error, 'No se pudo quitar');
        return data as { moved: number; unassigned: number };
      },
      // Las clases cambian de instructor: se refrescan agenda, clases y la lista de la academia.
      onSuccess: () => Promise.all([refresh(), qc.invalidateQueries({ queryKey: orgsKey }), qc.invalidateQueries({ queryKey: ['orgs', orgId] })]),
    }),
  };
}

export function useMyInvitations() {
  return useQuery({
    queryKey: myInvitationsKey,
    queryFn: async () => {
      const { data, error } = await api.me.invitations.get();
      if (error) throw new Error('No se pudieron cargar tus invitaciones');
      return data;
    },
  });
}

export function useRespondInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; accept: boolean }) => {
      const call = api.me.invitations({ id: v.id });
      const { error } = v.accept ? await call.accept.post() : await call.reject.post();
      if (error) fail(error, 'No se pudo responder');
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: myInvitationsKey }), qc.invalidateQueries({ queryKey: orgsKey })]),
  });
}

export function useLocationUpdate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      locationId: string;
      address?: string;
      neighborhood?: string;
      city?: string;
      zoneId?: string;
      mapsUrl?: string;
    }) => {
      const { locationId, ...body } = v;
      const { error } = await api.orgs({ id: orgId }).locations({ locationId }).patch(body);
      if (error) fail(error, 'No se pudo guardar');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKey(orgId) }),
  });
}

/* ── Clases: servicios y sesiones ────────────────────────────────────────── */

export const servicesKey = (orgId: string) => ['orgs', orgId, 'services'] as const;
export const sessionsKey = (orgId: string) => ['orgs', orgId, 'sessions'] as const;

export type ScheduleBody = {
  roomId: string;
  instructorUserId?: string;
  capacity?: number;
  startTime: string;
  weekdays?: number[];
  startDate: string;
  endDate?: string;
};

export type ServiceBody = {
  name: string;
  description?: string;
  kind?: 'GROUP' | 'PRIVATE' | 'WORKSHOP';
  disciplineId?: string;
  level?: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  priceCents: number;
  durationMin: number;
  defaultCapacity?: number;
  instructorUserId?: string;
  bufferMin?: number;
};

/** Error de la API con los choques de horario (si los hay) para mostrarlos. */
export class ApiError extends Error {
  conflicts?: { kind: 'room' | 'instructor'; date: string; time: string; with: string }[];
}

const apiFail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  const v = error?.value as { message?: string; conflicts?: ApiError['conflicts'] } | undefined;
  const e = new ApiError(v?.message ?? fallback);
  e.conflicts = v?.conflicts;
  throw e;
};

export function useServices(orgId: string | null | undefined) {
  return useQuery({
    queryKey: servicesKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).services.get();
      if (error) throw new Error('No se pudieron cargar los servicios');
      return data;
    },
  });
}

export type ServiceItem = NonNullable<ReturnType<typeof useServices>['data']>[number];

export function useSessions(orgId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: [...sessionsKey(orgId ?? ''), from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).sessions.get({ query: { from, to } });
      if (error) throw new Error('No se pudo cargar la agenda');
      // `date` = día local de la organización, calculado aquí: Eden reinterpreta como `Date` los textos tipo fecha.
      return { ...data, sessions: data.sessions.map((s) => ({ ...s, date: localDateOf(new Date(s.startsAt).getTime(), data.timezone) })) };
    },
  });
}

export type SessionItem = NonNullable<ReturnType<typeof useSessions>['data']>['sessions'][number];

export function useClassMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: servicesKey(orgId) }),
      qc.invalidateQueries({ queryKey: sessionsKey(orgId) }),
      // Lo que ve el alumno en Descubrir también cambió.
      qc.invalidateQueries({ queryKey: ['discover'] }),
    ]);
  return {
    createService: useMutation({
      mutationFn: async (v: ServiceBody & { schedule?: ScheduleBody }) => {
        const { data, error } = await api.orgs({ id: orgId }).services.post(v);
        if (error) return apiFail(error, 'No se pudo crear');
        return data;
      },
      onSuccess: refresh,
    }),
    updateService: useMutation({
      mutationFn: async (v: Partial<ServiceBody> & { serviceId: string; isActive?: boolean }) => {
        const { serviceId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).services({ serviceId }).patch(body);
        if (error) apiFail(error, 'No se pudo guardar');
      },
      onSuccess: refresh,
    }),
    schedule: useMutation({
      mutationFn: async (v: { serviceId: string; schedule: ScheduleBody }) => {
        const { data, error } = await api.orgs({ id: orgId }).services({ serviceId: v.serviceId }).sessions.post(v.schedule);
        if (error) return apiFail(error, 'No se pudo programar');
        return data;
      },
      onSuccess: refresh,
    }),
    updateSession: useMutation({
      mutationFn: async (v: {
        sessionId: string;
        roomId?: string;
        instructorUserId?: string | null;
        capacity?: number;
        date?: string;
        startTime?: string;
      }) => {
        const { sessionId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).sessions({ sessionId }).patch(body);
        if (error) apiFail(error, 'No se pudo guardar');
      },
      onSuccess: refresh,
    }),
    cancelSession: useMutation({
      mutationFn: async (v: { sessionId: string; scope: 'one' | 'following' }) => {
        const { data, error } = await api.orgs({ id: orgId }).sessions({ sessionId: v.sessionId }).cancel.post({ scope: v.scope });
        if (error) return apiFail(error, 'No se pudo cancelar');
        return data;
      },
      onSuccess: refresh,
    }),
  };
}

/** Requisitos y estado de la verificación para salir en Descubrir. */
export function useVerification(id: string | null | undefined) {
  return useQuery({
    queryKey: [...orgKey(id ?? ''), 'verification'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: id! }).verification.get();
      if (error) throw new Error('No se pudo cargar el estado de verificación');
      return data;
    },
  });
}

export function useRequestVerification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message?: string) => {
      const { error } = await api.orgs({ id }).verification.post({ message: message?.trim() || undefined });
      if (error) throw new Error((error.value as { message?: string } | undefined)?.message ?? 'No se pudo enviar la solicitud');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orgsKey }),
  });
}
