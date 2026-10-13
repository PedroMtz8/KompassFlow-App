import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** ¿El servidor tiene configurado el almacenamiento de archivos (R2)? Si no, se avisa en vez de fallar al subir. */
export function useStorageEnabled() {
  return useQuery({
    queryKey: ['storage'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.storage.get();
      if (error) throw new Error('No se pudo consultar el almacenamiento');
      return data;
    },
  });
}
