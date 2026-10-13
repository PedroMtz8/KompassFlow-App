import { stripeClient } from '@better-auth/stripe/client';
import { expoClient } from '@better-auth/expo/client';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { getBaseUrl } from './base-url';

const scheme = Array.isArray(Constants.expoConfig?.scheme)
  ? Constants.expoConfig.scheme[0]
  : (Constants.expoConfig?.scheme ?? 'kompasflow');

/**
 * Cliente de Better Auth para iOS y Android (cookies de sesión en SecureStore).
 * La versión web está en `auth-client.web.ts` (usa las cookies del navegador).
 */
export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    expoClient({ scheme, storagePrefix: scheme, storage: SecureStore }),
    organizationClient(),
    stripeClient({ subscription: true }),
  ],
});

/** Cabeceras para llamadas autenticadas a la API (cookie de sesión guardada en SecureStore). */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return cookie ? { cookie } : {};
}
