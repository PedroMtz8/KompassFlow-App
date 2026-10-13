import { useMutation, useQueryClient } from '@tanstack/react-query';

import { studentsKey } from '@/features/bookings/queries';
import { teamKey } from '@/features/organizations/queries';
import { api } from '@/lib/api';
import { useCredentials } from '@/stores/credentials';

const fail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

export type CreateAccountInput = { kind: 'student' } | { kind: 'staff'; role: string };

/** La academia crea una cuenta con contraseña temporal; el resultado se guarda (en memoria) para mostrarlo una vez. */
export function useAccountMutations(orgId: string, organizationName?: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: teamKey(orgId) }), qc.invalidateQueries({ queryKey: studentsKey(orgId) })]);
  return {
    create: useMutation({
      mutationFn: async (v: { name: string; email: string } & CreateAccountInput) => {
        const { data, error } = await api.orgs({ id: orgId }).accounts.post({
          kind: v.kind,
          name: v.name,
          email: v.email,
          role: v.kind === 'staff' ? v.role : undefined,
        });
        if (error) return fail(error, 'No se pudo crear la cuenta');
        useCredentials.getState().show({ name: v.name, email: data.email, password: data.password, expiresAt: data.expiresAt, organizationName });
      },
      onSuccess: refresh,
    }),
    reset: useMutation({
      mutationFn: async (v: { userId: string; name: string }) => {
        const { data, error } = await api.orgs({ id: orgId }).accounts({ userId: v.userId }).reset.post();
        if (error) return fail(error, 'No se pudo regenerar la contraseña');
        useCredentials.getState().show({ name: v.name, email: data.email, password: data.password, expiresAt: data.expiresAt, organizationName, reset: true });
      },
      onSuccess: refresh,
    }),
  };
}

/** Cambio obligatorio de la contraseña temporal (cuenta creada por una academia). */
export function useForcedPasswordChange() {
  return useMutation({
    mutationFn: async (v: { currentPassword: string; newPassword: string }) => {
      const { error } = await api.me.password.replace.post(v);
      if (error) fail(error, 'No se pudo cambiar la contraseña');
    },
  });
}
