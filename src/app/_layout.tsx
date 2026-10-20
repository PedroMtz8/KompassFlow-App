import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Platform, StatusBar as NativeStatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { Sidebar } from '@/components/sidebar';
import { usePushSetup } from '@/features/notifications/push';
import { useIsPlatformAdmin } from '@/features/admin/queries';
import { useActiveOrganization } from '@/features/organizations/queries';
import { useSecurity } from '@/features/security/queries';
import { useSpace } from '@/stores/space';
import { ImageCropperHost } from '@/components/image-cropper';
import { ToastHost } from '@/components/toast-host';
import { useIsDesktop } from '@/lib/use-layout';
import { authClient } from '@/lib/auth-client';
import { fontMap } from '@/lib/fonts';
import { OfflineBanner } from '@/components/offline-banner';
import { UpdateBanner } from '@/components/update-banner';
import { PAPER } from '@/features/web/colors';
import { QueryProvider, syncCacheOwner } from '@/lib/query-provider';
import { onlineManager } from '@tanstack/react-query';
import { installGlobalErrorHandlers } from '@/lib/report-error';
import { useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandlers();

/** Si algo se rompe al dibujar la app se ve esta pantalla (y se reporta) en lugar de una pantalla en blanco. */
export { AppErrorBoundary as ErrorBoundary } from '@/components/error-screen';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const t = useTheme();
  // En la web la página de presentación («/») se dibuja de inmediato, también en el servidor (SEO y carga rápida): no espera
  // a las fuentes ni a la sesión. El resto de pantallas sí esperan, para no mostrar texto con la fuente equivocada.
  const earlyLanding = useIsWebLanding();
  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: { ...DefaultTheme.colors, background: t.background, card: t.background, text: t.foreground, primary: t.primary, border: t.border },
    }),
    [t]
  );

  // El diseño de KompassFlow es solo claro.
  useEffect(() => {
    Uniwind.setTheme('light');
    // Fondo de la ventana nativa: en Android (borde a borde) es lo que se ve detrás de la barra de estado.
    SystemUI.setBackgroundColorAsync(t.background).catch(() => {});
  }, [t.background]);

  // Páginas web públicas: todo el marco ya va del color de papel de la página, para que el primer cuadro no parpadee con el
  // color del tema de la app (blanco → tema → página).
  const bg = earlyLanding ? PAPER : t.background;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaProvider style={{ backgroundColor: bg }}>
        <QueryProvider>
          <ThemeProvider value={navTheme}>
            {Platform.OS === 'android' ? (
              // En Android el fondo de la barra solo se pinta con el StatusBar nativo (cuando la app no va «borde a borde», p. ej.
              // en Expo Go la barra es opaca y negra por defecto, y los íconos oscuros no se verían).
              <NativeStatusBar barStyle="dark-content" backgroundColor={t.background} translucent={false} />
            ) : (
              <StatusBar style="dark" />
            )}
            {fontsLoaded || fontError || earlyLanding ? <RootNavigator /> : null}
            <PortalHost />
            <OfflineBanner />
            <UpdateBanner />
            <ToastHost />
            <ImageCropperHost />
          </ThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Páginas web públicas (landing y legales): se dibujan ya en el servidor, sin esperar a las fuentes ni a la sesión. */
const PUBLIC_WEB_PATHS = new Set(['/', '/privacy', '/terms', '/support']);

function useIsWebLanding() {
  const pathname = usePathname();
  return Platform.OS === 'web' && PUBLIC_WEB_PATHS.has(pathname);
}

/** Guard de autenticación: (auth) solo sin sesión; (student) y (academy) solo con sesión. */
function RootNavigator() {
  return <AuthNavigator />;
}

function AuthNavigator() {
  const t = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const desktop = useIsDesktop();
  const earlyLanding = useIsWebLanding();

  useEffect(() => {
    if (!isPending) SplashScreen.hideAsync();
  }, [isPending]);

  // Al cambiar de cuenta (o cerrar sesión) se descarta todo lo guardado: nadie ve datos de la persona anterior.
  const userId = session?.user.id;
  useEffect(() => {
    syncCacheOwner(userId, isPending);
  }, [userId, isPending]);

  // Al abrir la app con sesión se actualiza la copia guardada del usuario (foto, nombre…) sin esperar a que caduque.
  const hasSession = !!session;
  useEffect(() => {
    if (hasSession && onlineManager.isOnline()) authClient.getSession({ query: { disableCookieCache: true } });
  }, [hasSession]);

  // El modo (alumno/academia) sigue a la organización activa de la sesión: si hay una, se está en modo academia. Así nunca se
  // muestran las vistas de alumno estando una academia seleccionada (p. ej. tras recargar la app en otra pantalla).
  const { activeId, org: activeOrg } = useActiveOrganization();
  useEffect(() => {
    if (activeId && activeOrg) useSpace.getState().setMode('org');
  }, [activeId, activeOrg]);

  // Push del teléfono: cómo se muestran, a dónde llevan al tocarlas y mantener el token al día (solo iOS/Android, con permiso).
  usePushSetup(hasSession);

  // Cuenta creada por una academia con contraseña temporal: hasta que la cambie solo se ve la pantalla de cambio.
  const security = useSecurity(hasSession);
  const isAdmin = !!useIsPlatformAdmin(hasSession).data;
  if ((isPending || (hasSession && security.isPending)) && !earlyLanding) return null;

  const isSignedIn = !!session;
  const forced = isSignedIn && !!security.data?.mustChangePassword;

  return (
    <View className="flex-1 flex-row bg-background" style={earlyLanding ? { backgroundColor: PAPER } : undefined}>
      {isSignedIn && !forced && desktop ? <Sidebar /> : null}
      <View className="flex-1">
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: earlyLanding ? PAPER : t.background } }}>
          <Stack.Protected guard={isSignedIn && !forced}>
            <Stack.Screen name="(student)" />
            <Stack.Screen name="(academy)" />
          </Stack.Protected>
          <Stack.Protected guard={isSignedIn && !forced && isAdmin}>
            <Stack.Screen name="(admin)" />
          </Stack.Protected>
          <Stack.Protected guard={forced}>
            <Stack.Screen name="force-password" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </View>
    </View>
  );
}
