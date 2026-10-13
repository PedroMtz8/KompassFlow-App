import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/features/auth/errors';

const key = ['me', 'security'] as const;

/** ¿La cuenta ya tiene contraseña? ¿Con qué proveedores entra? */
export function useSecurity(enabled = true) {
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { data, error } = await api.me.security.get();
      if (error) throw new Error('No se pudo cargar la seguridad de tu cuenta');
      return data;
    },
  });
}

/** Vincula (abre Google y vuelve) o desvincula Google de la cuenta actual. */
export function useGoogleLink() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return {
    link: useMutation({
      mutationFn: async () => {
        const { error } = await authClient.linkSocial({ provider: 'google', callbackURL: '/account' });
        if (error) throw new Error(authErrorMessage(error, 'No se pudo vincular Google.'));
      },
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: async () => {
        const list = await authClient.listAccounts();
        const acc = list.data?.find((a) => a.providerId === 'google');
        if (!acc) throw new Error('Tu cuenta no tiene Google vinculado.');
        const { error } = await authClient.unlinkAccount({ accountId: acc.id });
        if (error) throw new Error(authErrorMessage(error, 'No se pudo desvincular Google.'));
      },
      onSuccess: refresh,
    }),
  };
}

/** Define la contraseña (cuenta de Google sin contraseña) o la cambia (pide la actual). */
export function usePasswordMutation(hasPassword: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { current: string; next: string }) => {
      if (hasPassword) {
        const { error } = await authClient.changePassword({ currentPassword: v.current, newPassword: v.next, revokeOtherSessions: false });
        if (error) throw new Error(authErrorMessage(error, 'No se pudo cambiar la contraseña.'));
        return;
      }
      const { error } = await api.me.password.post({ newPassword: v.next });
      if (error) throw new Error((error.value as { message?: string } | undefined)?.message ?? 'No se pudo definir la contraseña.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
