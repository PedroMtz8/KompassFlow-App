import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

/**
 * Push en el teléfono. Los avisos dentro de la app (la campana) funcionan siempre; la push es un extra que solo existe en
 * iOS/Android y necesita permiso de la persona. En Expo Go de Android las push remotas no existen (SDK 53+): ahí se usa la
 * campana; en la app instalada (build) funcionan en ambos.
 */
const TOKEN_KEY = 'stagelight.pushToken';
const native = Platform.OS === 'ios' || Platform.OS === 'android';

type Notif = typeof NotificationsModule;
let loaded: Notif | null | undefined;
/**
 * Carga `expo-notifications` solo si su parte NATIVA existe en esta build. Una build instalada ANTES de agregar el módulo
 * (p. ej. un development build viejo) no la trae, y cargarlo igual tumba la app: Metro reporta como error fatal el fallo
 * de un módulo aunque se atrape con try/catch. Por eso primero se pregunta (sin lanzar) si el módulo nativo está.
 * Sin módulo no hay push; la campana dentro de la app sigue funcionando.
 */
function lib(): Notif | null {
  if (!native) return null;
  if (loaded === undefined) {
    // `ExpoPushTokenManager` es lo primero que `expo-notifications` pide al cargarse.
    if (!requireOptionalNativeModule('ExpoPushTokenManager')) {
      loaded = null;
      return loaded;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('expo-notifications') as Notif;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'no-project' | 'error';

let handlerSet = false;
function setHandler() {
  const Notifications = lib();
  if (handlerSet || !Notifications) return;
  handlerSet = true;
  // Con la app abierta el aviso también se muestra (la campana se actualiza sola).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Solo rutas internas de la app: un aviso nunca debe poder abrir un enlace externo. */
const safeRoute = (u: unknown) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : null);

async function getToken(): Promise<PushResult | { token: string }> {
  const Notifications = lib();
  if (!Notifications) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Avisos', importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'no-project';
  try {
    return { token: (await Notifications.getExpoPushTokenAsync({ projectId })).data };
  } catch {
    return 'error';
  }
}

async function register(token: string) {
  const { error } = await api.me['push-token'].post({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  if (error) return false;
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
  return true;
}

/** Pide permiso (si hace falta) y registra este teléfono para recibir push. */
export async function enablePush(): Promise<PushResult> {
  const Notifications = lib();
  if (!Notifications) return 'unsupported';
  setHandler();
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const t = await getToken();
    if (typeof t === 'string') return t;
    return (await register(t.token)) ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** ¿Este teléfono ya tiene permiso y un token registrado? (para mostrar el estado). */
export async function pushStatus(): Promise<'on' | 'off' | 'unsupported'> {
  const Notifications = lib();
  if (!Notifications) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' && !!(await SecureStore.getItemAsync(TOKEN_KEY)) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Antes de cerrar sesión: este teléfono deja de recibir los avisos de la cuenta que se va. */
export async function unregisterPush() {
  if (!native) return;
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await api.me['push-token'].delete({ token });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* sin red: el servidor mueve el token a la siguiente cuenta que lo use */
  }
}

/**
 * Con sesión iniciada: configura cómo se muestran los avisos, abre la pantalla correcta al tocar uno y, si la persona ya dio
 * permiso, mantiene el token al día (cambia de vez en cuando).
 */
export function usePushSetup(signedIn: boolean) {
  useEffect(() => {
    const Notifications = lib();
    if (!Notifications || !signedIn) return;
    setHandler();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = safeRoute(r.notification.request.content.data?.url);
      if (url) router.push(url as never);
    });
    // App abierta desde un aviso con la app cerrada.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        const url = safeRoute(r?.notification.request.content.data?.url);
        if (url) router.push(url as never);
      })
      .catch(() => {});
    pushStatus()
      .then(async (s) => {
        if (s !== 'on') return;
        const t = await getToken();
        if (typeof t !== 'string') await register(t.token);
      })
      // Expo Go de Android no tiene push remotas: no es un error, simplemente no hay token que mantener.
      .catch(() => {});
    return () => sub.remove();
  }, [signedIn]);
}
