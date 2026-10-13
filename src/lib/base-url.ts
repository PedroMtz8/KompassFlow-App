import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * URL base del servidor (donde vive `/api`).
 * - EXPO_PUBLIC_API_URL tiene prioridad (obligatoria en builds nativas de producción).
 * - Web: el mismo origen de la página.
 * - Nativo en desarrollo: el host del dev server de Expo (hostUri o, si no viene, el origen del bundle).
 */
export function getBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (Platform.OS === 'web') {
    // En el render de servidor (SSR) no hay `window`; el valor solo se usa al montar el cliente.
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri}`;

  // Respaldo: en algunos arranques del dev client (p. ej. `expo run:ios`) no hay hostUri,
  // pero React Native sabe de qué dev server descargó el bundle.
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const devServer = require('react-native/Libraries/Core/Devtools/getDevServer').default() as {
      url?: string;
      bundleLoadedFromServer?: boolean;
    };
    if (devServer.bundleLoadedFromServer && devServer.url) return devServer.url.replace(/\/$/, '');
  }

  throw new Error('Define EXPO_PUBLIC_API_URL: no se pudo deducir la URL del servidor.');
}
