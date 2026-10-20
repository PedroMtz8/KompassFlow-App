import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ambient } from '@/components/ui/ambient';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

type ScreenProps = React.ComponentProps<typeof View> & {
  /** Respeta también el área segura inferior (pantallas sin barra de tabs). */
  bottomInset?: boolean;
};

/** En web no hay barra de estado ni notch (insets = 0): se deja aire arriba para que el contenido no quede pegado al borde. */
const WEB_TOP_GAP = Platform.OS === 'web' ? 28 : 0;

/** Contenedor base de pantalla: fondo con velo de color + áreas seguras. */
export function Screen({ className, bottomInset = false, style, children, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Android: la barra de estado es baja (sin notch ni isla), así que el contenido queda pegado a ella tanto si la app va
  // «borde a borde» (el inset es la altura de la barra) como si no (inset 0). En iOS el inset ya deja aire suficiente.
  const androidGap = Platform.OS === 'android' ? 14 : 0;
  return (
    <View
      className={cn('flex-1 bg-background', className)}
      style={[{ paddingTop: insets.top + WEB_TOP_GAP + androidGap, paddingBottom: bottomInset ? insets.bottom : 0 }, style]}
      {...props}
    >
      <Ambient />
      {children}
    </View>
  );
}

const PULL_THRESHOLD = 64;

/**
 * Cuerpo desplazable con el gutter de 20 px del diseño y ancho máximo en web.
 * Con `onRefresh` se puede jalar hacia abajo para recargar: en iOS/Android usa el control nativo y en web
 * (navegador móvil o emulación táctil) un indicador propio, porque `RefreshControl` no existe en react-native-web.
 */
export function ScreenScroll({
  className,
  contentContainerClassName,
  wide,
  onRefresh: onRefreshProp,
  refreshable = true,
  refreshing = false,
  onScroll,
  children,
  ...props
}: React.ComponentProps<typeof ScrollView> & {
  /** En escritorio usa todo el ancho útil (listas y tableros) en vez de una columna angosta. */
  wide?: boolean;
  /** Recarga propia al jalar. Si se omite, se recargan todas las consultas activas de la pantalla (no hace falta pasarla). */
  onRefresh?: () => Promise<unknown> | void;
  /** `false` desactiva jalar para recargar (por ejemplo en formularios con texto sin guardar). */
  refreshable?: boolean;
  refreshing?: boolean;
}) {
  const t = useTheme();
  const queryClient = useQueryClient();
  const onRefresh = useMemo(
    () => (refreshable ? (onRefreshProp ?? (() => queryClient.refetchQueries({ type: 'active' }))) : undefined),
    [refreshable, onRefreshProp, queryClient]
  );
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const scrollY = useRef(0);
  const startY = useRef<number | null>(null);
  const web = Platform.OS === 'web';
  const loading = refreshing || busy;

  const run = useCallback(async () => {
    setBusy(true);
    try {
      await onRefresh?.();
    } finally {
      setBusy(false);
    }
  }, [onRefresh]);

  const webHandlers =
    web && onRefresh
      ? {
          onTouchStart: (e: { nativeEvent: { touches: { pageY: number }[] } }) => {
            startY.current = scrollY.current <= 0 ? e.nativeEvent.touches[0].pageY : null;
          },
          onTouchMove: (e: { nativeEvent: { touches: { pageY: number }[] } }) => {
            if (startY.current == null || loading) return;
            const dy = e.nativeEvent.touches[0].pageY - startY.current;
            setPull(dy > 0 ? Math.min(dy * 0.5, PULL_THRESHOLD * 1.5) : 0);
          },
          onTouchEnd: () => {
            if (pull >= PULL_THRESHOLD && !loading) run();
            startY.current = null;
            setPull(0);
          },
        }
      : {};

  return (
    <ScrollView
      className={cn('flex-1', className)}
      contentContainerClassName={cn(
        'mx-auto w-full max-w-[480px] gap-3 px-5 pb-8 md:max-w-[680px]',
        wide && 'lg:max-w-[1040px]',
        contentContainerClassName
      )}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      refreshControl={
        !web && onRefresh ? <RefreshControl refreshing={loading} onRefresh={run} tintColor={t.primary} colors={[t.primary]} /> : undefined
      }
      {...(web ? { style: { overscrollBehaviorY: 'contain' } as object } : {})}
      {...webHandlers}
      {...props}
    >
      {web && onRefresh && (pull > 0 || loading) ? (
        <View className="items-center justify-center" style={{ height: loading ? 40 : Math.max(pull, 8) }}>
          <ActivityIndicator color={t.primary} animating={loading || pull >= PULL_THRESHOLD} />
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}
