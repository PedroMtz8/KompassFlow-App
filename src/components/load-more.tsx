import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type PagedQuery = { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };

/** Botón «Cargar más» para listas por páginas (no aparece si ya se cargó todo). */
export function LoadMore({ q, label = 'Cargar más' }: { q: PagedQuery; label?: string }) {
  if (!q.hasNextPage) return null;
  return (
    <Button variant="secondary" disabled={q.isFetchingNextPage} onPress={() => q.fetchNextPage()}>
      {q.isFetchingNextPage ? <ActivityIndicator /> : <Text>{label}</Text>}
    </Button>
  );
}
