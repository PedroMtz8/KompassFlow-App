import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

/**
 * Recarga las consultas activas cuyo prefijo coincide (p. ej. `['orgs', orgId]` = todo lo de esa academia que la pantalla
 * muestra). Devuelve la función para `onRefresh` de `ScreenScroll` y si hay una recarga en curso.
 */
export function useRefresh(...keys: readonly unknown[][]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Las llaves se serializan para que la función solo cambie cuando cambia su contenido.
  const serialized = JSON.stringify(keys);
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const list = JSON.parse(serialized) as unknown[][];
      await Promise.allSettled(list.map((queryKey) => qc.refetchQueries({ queryKey, type: 'active' })));
    } finally {
      setBusy(false);
    }
  }, [qc, serialized]);
  return { refresh, busy };
}
