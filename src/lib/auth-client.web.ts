import { stripeClient } from '@better-auth/stripe/client';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { getBaseUrl } from './base-url';

/**
 * Cliente de Better Auth para web: la API vive en el mismo origen, así que el navegador
 * gestiona las cookies (HttpOnly). No usa expo-secure-store.
 */
export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [organizationClient(), stripeClient({ subscription: true })],
});

/** En web las cookies viajan solas (mismo origen). */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {};
}
