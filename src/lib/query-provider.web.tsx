import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClient } from '@/lib/query-client';

/** En la web no se guarda copia sin conexión (solo en el teléfono); el caché vive en memoria. */
export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Descarta lo guardado si cambia la cuenta (o se cierra sesión): nadie ve datos de la persona anterior. */
export function syncCacheOwner(userId: string | undefined, pending: boolean) {
  if (pending) return;
  queryClient.clear();
  void userId;
}
