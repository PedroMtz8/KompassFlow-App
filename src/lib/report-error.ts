import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getBaseUrl } from './base-url';

// Evita mandar el mismo error una y otra vez (un render que falla en bucle, por ejemplo).
const seen = new Map<string, number>();
let installed = false;

/** Manda un fallo de la app al servidor (que lo registra y lo envía a Sentry). Nunca lanza y nunca incluye datos de la persona. */
export function reportClientError(error: unknown, screen?: string) {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error desconocido');
    const key = `${e.name}:${e.message}`;
    const now = Date.now();
    if (now - (seen.get(key) ?? 0) < 30_000) return;
    seen.set(key, now);
    void fetch(`${getBaseUrl()}/api/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: e.message.slice(0, 1500) || e.name,
        stack: e.stack?.slice(0, 6000),
        screen: screen ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : undefined),
        platform: Platform.OS,
        version: Constants.expoConfig?.version,
      }),
    }).catch(() => {});
  } catch {
    /* reportar un fallo nunca debe causar otro */
  }
}

/** Atrapa los errores que nadie atrapó (excepciones globales y promesas rechazadas) y los reporta; no cambia cómo se comportan. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev) => reportClientError(ev.error ?? ev.message));
    window.addEventListener('unhandledrejection', (ev) => reportClientError(ev.reason));
    return;
  }
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((e, fatal) => {
    reportClientError(e);
    previous(e, fatal);
  });
}
