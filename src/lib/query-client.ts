import { MutationCache, onlineManager, QueryClient } from '@tanstack/react-query';

/** Lo que se guarda en el teléfono para consultarlo sin señal: la información propia de la persona y las cifras básicas de su academia. */
const DAY = 24 * 60 * 60 * 1000;
export const OFFLINE_MAX_AGE = 7 * DAY;

export const queryClient = new QueryClient({
  // Sin conexión no se encola nada para después: una acción pendiente podría ejecutarse horas más tarde. Se rechaza al instante.
  mutationCache: new MutationCache({
    onMutate: () => {
      if (!onlineManager.isOnline()) throw new Error('Sin conexión. Conéctate a internet para hacer cambios.');
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // Sin red la consulta falla enseguida (en vez de quedarse «cargando» para siempre) y se sigue mostrando lo guardado.
      networkMode: 'always',
    },
  },
});

// Lo guardado en disco debe seguir vivo en memoria al menos lo que dura en disco.
queryClient.setQueryDefaults(['me'], { gcTime: OFFLINE_MAX_AGE });
queryClient.setQueryDefaults(['orgs'], { gcTime: OFFLINE_MAX_AGE });
