import { router } from 'expo-router';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';

type Q = { isPending: boolean; isError: boolean; data?: unknown; isFetching?: boolean; refetch: () => unknown };

/** Aviso de que falló la carga, con botón para reintentar. Sin esto, un error se confundía con «no hay datos». */
export function ErrorNotice({ onRetry, busy, what = 'la información', fill }: { onRetry: () => unknown; busy?: boolean; what?: string; fill?: boolean }) {
  const t = useTheme();
  return (
    <View className={fill ? 'flex-1 items-center justify-center gap-3 bg-background px-8' : 'items-center gap-3 rounded-[22px] bg-card px-5 py-6'}>
      <Icon as={WifiOff} size={22} color={t.subtle} />
      <Text className="text-center text-sm font-bold">No pudimos cargar {what}</Text>
      <Text variant="muted" className="text-center text-xs">
        Revisa tu conexión e inténtalo de nuevo.
      </Text>
      <Pressable
        onPress={() => onRetry()}
        disabled={busy}
        className="flex-row items-center gap-2 rounded-full bg-primary-soft px-4 py-2 active:opacity-80"
      >
        {busy ? <ActivityIndicator size="small" color={t.primary} /> : <Icon as={RefreshCw} size={14} color={t.primaryDark} />}
        <Text className="text-[13px] font-bold text-primary-dark">Reintentar</Text>
      </Pressable>
      {fill ? (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} className="py-1">
          <Text className="text-[13px] font-bold text-muted-foreground">Volver</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Indicador de carga o, si la consulta falló, aviso con reintento. No pinta nada cuando ya hay datos. */
export function QueryStatus({ q, what }: { q: Q; what?: string }) {
  if (q.isPending) return <ActivityIndicator />;
  // Con datos guardados un fallo de red no tapa la lista: se sigue mostrando lo último que se consultó.
  if (q.isError && q.data === undefined) return <ErrorNotice onRetry={q.refetch} busy={q.isFetching} what={what} />;
  return null;
}
