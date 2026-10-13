import { treaty } from '@elysiajs/eden';
import { Platform } from 'react-native';

// Solo el TIPO del servidor llega al cliente. Nunca importes valores de `@/server` aquí:
// el código importado por el cliente termina en su bundle (y con él, secretos).
import type { App } from '@/server';

import { getAuthHeaders } from './auth-client';
import { getBaseUrl } from './base-url';

/**
 * Cliente tipado (Eden) para la API de Elysia:
 *   const { data, error } = await api.health.get();
 */
export const api = treaty<App>(getBaseUrl(), {
  headers: () => getAuthHeaders(),
  fetch: { credentials: Platform.OS === 'web' ? 'include' : 'omit' },
  // Si el servidor de desarrollo responde con una página HTML de error (por ejemplo mientras recompila), se trata
  // como un error de red y no como datos: así ninguna pantalla recibe algo que no es JSON.
  fetcher: async (input, init) => {
    const res = await fetch(input, init);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
      return new Response(JSON.stringify({ message: 'El servidor no está disponible. Inténtalo de nuevo.' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return res;
  },
}).api;
