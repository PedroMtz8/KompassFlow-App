import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

const fail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

export const rolesKey = (orgId: string) => ['orgs', orgId, 'roles'] as const;

/** Roles de la academia (del sistema y personalizados) y el catálogo de permisos con sus textos. */
export function useRoles(orgId: string | null | undefined) {
  return useQuery({
    queryKey: rolesKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).roles.get();
      if (error) throw new Error('No se pudieron cargar los roles');
      return data;
    },
  });
}

export type RoleItem = NonNullable<ReturnType<typeof useRoles>['data']>['roles'][number];
export type Permissions = Record<string, string[]>;

/** Da permisos adicionales a una persona sobre su rol; con `template` crea además un rol reutilizable y se lo asigna. */
export function useMemberExtras(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { memberId: string; permissions: Permissions; template?: { name: string } }) => {
      const { data, error } = await api.orgs({ id: orgId }).members({ memberId: v.memberId })['extra-permissions'].put({
        permissions: v.permissions,
        template: v.template,
      });
      if (error) return fail(error, 'No se pudo guardar');
      return data;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: rolesKey(orgId) }),
        qc.invalidateQueries({ queryKey: ['orgs', orgId, 'team'] }),
      ]),
  });
}

export function useRoleMutations(orgId: string) {
  const qc = useQueryClient();
  // Cambiar un rol cambia lo que cada persona puede hacer: se refrescan roles, equipo y las academias (permisos efectivos).
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: rolesKey(orgId) }),
      qc.invalidateQueries({ queryKey: ['orgs', orgId, 'team'] }),
      qc.invalidateQueries({ queryKey: ['orgs'], exact: true }),
    ]);
  return {
    create: useMutation({
      mutationFn: async (v: { name: string; permissions: Permissions }) => {
        const { error } = await api.orgs({ id: orgId }).roles.post(v);
        if (error) fail(error, 'No se pudo crear el rol');
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: { role: string; permissions: Permissions }) => {
        const { error } = await api.orgs({ id: orgId }).roles({ role: encodeURIComponent(v.role) }).patch({ permissions: v.permissions });
        if (error) fail(error, 'No se pudo guardar el rol');
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (role: string) => {
        const { error } = await api.orgs({ id: orgId }).roles({ role: encodeURIComponent(role) }).delete();
        if (error) fail(error, 'No se pudo borrar el rol');
      },
      onSuccess: refresh,
    }),
  };
}
