import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/web';

import { env } from '../env';
import * as schema from './schema';

// SQLite local (`file:...`) necesita el cliente Node (binding nativo); solo funciona en Node.
// Para URLs remotas (Turso o `turso dev`) se usa el cliente "web" (HTTP/WebSocket),
// que también funciona en Workers (EAS Hosting).
const config = { url: env.tursoUrl, authToken: env.tursoToken };

/* eslint-disable @typescript-eslint/no-require-imports */
const client: Client = config.url.startsWith('file:')
  ? require('@libsql/client').createClient(config)
  : require('@libsql/client/web').createClient(config);
/* eslint-enable @typescript-eslint/no-require-imports */

export const db = drizzle(client, { schema });
export { schema };
