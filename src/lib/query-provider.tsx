import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import Storage from 'expo-sqlite/kv-store';
import type { ReactNode } from 'react';

import { OFFLINE_MAX_AGE, queryClient } from '@/lib/query-client';

const CACHE_KEY = 'kf-query-cache';
const OWNER_KEY = 'kf-cache-owner';

const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => Storage.getItem(k), setItem: (k, v) => Storage.setItem(k, v), removeItem: (k) => Storage.removeItem(k) },
  key: CACHE_KEY,
  throttleTime: 2000,
});

/**
 * Solo se guarda lo necesario para consultar sin señal: lo propio de la persona (`me`: reservas, pases, perfil…) y, de su academia,
 * la ficha y la agenda. Descubrir, alumnos, pagos, reportes y administración nunca se guardan.
 */
const persistable = (key: readonly unknown[]) => key[0] === 'me' || (key[0] === 'orgs' && (key.length <= 2 || key[2] === 'sessions'));

// El estado de red sigue al sistema (en el teléfono no hay eventos de navegador).
onlineManager.setEventListener((setOnline) => {
  Network.getNetworkStateAsync().then((s) => setOnline(s.isInternetReachable !== false && s.isConnected !== false));
  const sub = Network.addNetworkStateListener((s) => setOnline(s.isInternetReachable !== false && s.isConnected !== false));
  return () => sub.remove();
});

let current: { userId: string | undefined; pending: boolean } = { userId: undefined, pending: true };

/** Descarta lo guardado si cambia la cuenta (o se cierra sesión): nadie ve datos de la persona anterior. */
export function syncCacheOwner(userId: string | undefined, pending: boolean) {
  current = { userId, pending };
  if (pending) return;
  const owner = Storage.getItemSync(OWNER_KEY) ?? undefined;
  if (owner === userId) return;
  queryClient.clear();
  Storage.removeItemSync(CACHE_KEY);
  if (userId) Storage.setItemSync(OWNER_KEY, userId);
  else Storage.removeItemSync(OWNER_KEY);
}

/** Guarda en el teléfono las consultas permitidas y las restaura al abrir la app, aunque no haya internet. */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: OFFLINE_MAX_AGE,
        buster: 'v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && persistable(q.queryKey) },
      }}
      // Si lo restaurado es de otra cuenta, se descarta (la sesión pudo resolverse antes que la restauración).
      onSuccess={() => syncCacheOwner(current.userId, current.pending)}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
