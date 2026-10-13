/**
 * Sirve SOLO la API (sin Metro ni la app) en un puerto: `bun scripts/serve-api.ts [puerto]`. Lo usa el corredor de pruebas
 * para la revisión de seguridad y sirve para probar la API sin levantar Expo.
 */
import { api } from '../src/server/app';

declare const Bun: { serve: (o: { port: number; fetch: (r: Request) => Response | Promise<Response> }) => unknown };

const port = Number(process.argv[2] ?? process.env.PORT ?? 8099);
Bun.serve({ port, fetch: (r) => api.fetch(r) });
console.log(`API lista en http://localhost:${port}`);
