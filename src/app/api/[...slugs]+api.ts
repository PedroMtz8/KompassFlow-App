import { handleRequest } from '@/server';

/**
 * Adaptador entre Expo Router y la app Elysia de `src/server`.
 * Es lo único que acopla el backend a Expo: al mover el backend a otro proyecto,
 * se reemplaza este archivo por el `fetch` del nuevo servidor.
 */
const handle = (request: Request) => handleRequest(request);

export { handle as DELETE, handle as GET, handle as HEAD, handle as OPTIONS, handle as PATCH, handle as POST, handle as PUT };
