import type { ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { reportClientError } from '@/lib/report-error';

/**
 * Pantalla que se ve cuando algo se rompe al dibujar la app (en vez de una pantalla en blanco). Reporta el fallo y deja reintentar.
 * Expo Router la usa como `ErrorBoundary` de la ruta.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-soft">
        <Icon as={TriangleAlert} size={26} />
      </View>
      <Text className="text-center text-lg font-extrabold">Algo salió mal</Text>
      <Text variant="muted" className="text-center text-sm">
        Ya recibimos el aviso del problema. Intenta de nuevo; si sigue pasando, cierra y vuelve a abrir la app.
      </Text>
      <Pressable onPress={() => retry()} className="mt-1 rounded-full bg-primary px-6 py-3 active:opacity-80">
        <Text className="text-[14px] font-bold text-white">Reintentar</Text>
      </Pressable>
    </View>
  );
}
