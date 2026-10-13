import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

const adminKey = ['admin'] as const;

/** ¿La persona administra la plataforma? (decide si se ofrece el panel). */
export function useIsPlatformAdmin(enabled = true) {
  return useQuery({
    queryKey: [...adminKey, 'me'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await api.admin.me.get();
      return !!data?.admin;
    },
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: [...adminKey, 'plans'],
    queryFn: async () => {
      const { data, error } = await api.admin.plans.get();
      if (error) throw new Error('No se pudieron cargar los planes');
      return data;
    },
  });
}

export type AdminPlan = NonNullable<ReturnType<typeof useAdminPlans>['data']>[number];

export type PlanChanges = {
  priceMxn?: number;
  trialDays?: number;
  maxStudents?: number | null;
  maxMembers?: number | null;
  maxLocations?: number | null;
  reports?: boolean;
  cardFeeBps?: number;
};

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { plan: string; changes: PlanChanges }) => {
      const { data, error } = await api.admin.plans({ plan: v.plan }).put(v.changes);
      if (error) throw new Error((error.value as { message?: string } | undefined)?.message ?? 'No se pudo guardar');
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData([...adminKey, 'plans'], data);
      // Los planes que ven las academias cambian con esto.
      qc.invalidateQueries({ queryKey: ['orgs'] });
    },
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: [...adminKey, 'overview'],
    queryFn: async () => {
      const { data, error } = await api.admin.overview.get();
      if (error) throw new Error('No se pudo cargar el resumen');
      return data;
    },
  });
}

const PAGE = 30;

export function useAdminOrgs(q: string) {
  return useInfiniteQuery({
    queryKey: [...adminKey, 'orgs', q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.admin.orgs.get({ query: { q: q || undefined, limit: PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar las academias');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export type AdminOrg = NonNullable<ReturnType<typeof useAdminOrgs>['data']>[number];

export function useAdminOrg(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKey, 'org', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.admin.orgs({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar la academia');
      return data;
    },
  });
}

/* ── Verificación de negocios ─────────────────────────────────────────────── */

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function useVerificationCounts() {
  return useQuery({
    queryKey: [...adminKey, 'verifications', 'counts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await api.admin.verifications.counts.get();
      if (error) throw new Error('No se pudo cargar el conteo');
      return data;
    },
  });
}

export function useAdminVerifications(status: VerificationStatus) {
  return useInfiniteQuery({
    queryKey: [...adminKey, 'verifications', 'list', status],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.admin.verifications.get({ query: { status, limit: PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar las solicitudes');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export type AdminVerificationRow = NonNullable<ReturnType<typeof useAdminVerifications>['data']>[number];

export function useAdminVerification(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKey, 'verifications', 'detail', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.admin.verifications({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar la solicitud');
      return data;
    },
  });
}

export type VerificationMethod = 'WEBSITE' | 'SOCIAL' | 'PHONE' | 'OTHER';

export function useReviewVerification(id: string) {
  const qc = useQueryClient();
  const fail = (error: { value?: unknown } | null) => new Error((error?.value as { message?: string } | undefined)?.message ?? 'No se pudo guardar');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: [...adminKey] }), qc.invalidateQueries({ queryKey: ['discover'] })]);
  const approve = useMutation({
    mutationFn: async (v: { method: VerificationMethod; note?: string }) => {
      const { error } = await api.admin.verifications({ id }).approve.post(v);
      if (error) throw fail(error);
    },
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: async (v: { reason: string; note?: string }) => {
      const { error } = await api.admin.verifications({ id }).reject.post(v);
      if (error) throw fail(error);
    },
    onSuccess: refresh,
  });
  return { approve, reject };
}

/* ── Plan otorgado a mano ─────────────────────────────────────────────────── */

export function useGrantPlan(id: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [...adminKey] });
  const grant = useMutation({
    mutationFn: async (v: { plan: string; days: number | null; note?: string }) => {
      const { error } = await api.admin.orgs({ id }).plan.put(v);
      if (error) throw new Error((error.value as { message?: string } | undefined)?.message ?? 'No se pudo otorgar el plan');
    },
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.orgs({ id }).plan.delete();
      if (error) throw new Error((error.value as { message?: string } | undefined)?.message ?? 'No se pudo quitar el plan');
    },
    onSuccess: refresh,
  });
  return { grant, revoke };
}

export function useAdminUsers(q: string) {
  return useInfiniteQuery({
    queryKey: [...adminKey, 'users', q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.admin.users.get({ query: { q: q || undefined, limit: PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar los usuarios');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKey, 'user', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.admin.users({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar al usuario');
      return data;
    },
  });
}

export function useSuspendUser(id: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [...adminKey] });
  const msg = (e: { value?: unknown } | null) => (e?.value as { message?: string } | undefined)?.message ?? 'No se pudo guardar';
  const suspend = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await api.admin.users({ id }).suspend.post({ reason });
      if (error) throw new Error(msg(error));
    },
    onSuccess: refresh,
  });
  const reactivate = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.users({ id }).reactivate.post();
      if (error) throw new Error(msg(error));
    },
    onSuccess: refresh,
  });
  return { suspend, reactivate };
}

export function useAdminAudit(prefix: string) {
  return useInfiniteQuery({
    queryKey: [...adminKey, 'audit', prefix],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.admin.audit.get({ query: { prefix: prefix || undefined, limit: PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudo cargar la bitácora');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}
