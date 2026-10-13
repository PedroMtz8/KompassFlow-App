import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

export const notificationsKey = ['me', 'notifications'] as const;
const PAGE = 30;

/** Cuántos avisos sin leer tengo (la campana). Se revisa cada minuto y al volver a la app. */
export function useUnreadCount() {
  const { data: session } = authClient.useSession();
  return useQuery({
    queryKey: [...notificationsKey, 'unread'],
    enabled: !!session,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await api.me.notifications.unread.get();
      if (error) throw new Error('No se pudo cargar los avisos');
      return data.unread;
    },
  });
}

/** Bandeja de avisos, del más reciente al más antiguo, por páginas. */
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: [...notificationsKey, 'list'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.me.notifications.get({ query: { limit: PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar tus avisos');
      return data;
    },
    getNextPageParam: (last, all) => (last.items.length === PAGE ? all.length * PAGE : undefined),
    select: (d) => ({ unread: d.pages[0]?.unread ?? 0, items: d.pages.flatMap((p) => p.items) }),
  });
}

export type NotificationItem = NonNullable<ReturnType<typeof useNotifications>['data']>['items'][number];

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await api.me.notifications.read.post({ ids });
      if (error) throw new Error('No se pudo marcar como leído');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: [...notificationsKey, 'prefs'],
    queryFn: async () => {
      const { data, error } = await api.me['notification-prefs'].get();
      if (error) throw new Error('No se pudieron cargar tus preferencias');
      return data;
    },
  });
}

export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  const key = [...notificationsKey, 'prefs'];
  return useMutation({
    mutationFn: async (v: { reminders: boolean; classChanges: boolean; payments: boolean; team: boolean }) => {
      const { data, error } = await api.me['notification-prefs'].put(v);
      if (error || !data) throw new Error('No se pudieron guardar tus preferencias');
      return data;
    },
    // El interruptor responde al instante; si el servidor falla, vuelve a como estaba.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old: object | undefined) => ({ ...(old ?? {}), ...v }));
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
