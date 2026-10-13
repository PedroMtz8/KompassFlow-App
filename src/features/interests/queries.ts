import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const catalogKey = ['catalog'] as const;
export const interestsKey = ['me', 'interests'] as const;

/** Rubros (Baile, Fitness…) con sus disciplinas. */
export function useCatalog() {
  return useQuery({
    queryKey: catalogKey,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.catalog.get();
      if (error) throw new Error('No se pudo cargar el catálogo');
      return data;
    },
  });
}

/** Rubros y disciplinas que eligió el usuario. */
export function useMyInterests() {
  return useQuery({
    queryKey: interestsKey,
    queryFn: async () => {
      const { data, error } = await api.me.interests.get();
      if (error) throw new Error('No se pudieron cargar tus intereses');
      return data;
    },
  });
}

export function useSaveInterests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { verticalIds?: string[]; disciplineIds: string[] }) => {
      const { data, error } = await api.me.interests.put(input);
      if (error) throw new Error('No se pudieron guardar tus intereses');
      return data;
    },
    // Optimista: el chip responde al instante y se revierte si el servidor falla.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: interestsKey });
      const previous = qc.getQueryData(interestsKey);
      qc.setQueryData(interestsKey, (old: { verticalIds: string[]; disciplineIds: string[] } | undefined) => ({
        verticalIds: input.verticalIds ?? old?.verticalIds ?? [],
        disciplineIds: input.disciplineIds,
      }));
      return { previous };
    },
    onError: (_e, _i, ctx) => ctx?.previous && qc.setQueryData(interestsKey, ctx.previous),
    onSuccess: (data) => qc.setQueryData(interestsKey, data),
  });
}
