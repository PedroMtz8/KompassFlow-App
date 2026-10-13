import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { db } from '../db';
import { env } from '../env';

/** Para monitores de disponibilidad (UptimeRobot, Better Stack…): 200 si el servidor Y la base de datos responden, 503 si no. */
export const healthModule = new Elysia({ name: 'health' }).get('/health', async ({ status }) => {
  const started = Date.now();
  try {
    await Promise.race([db.run(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);
    return { ok: true as const, db: true as const, ms: Date.now() - started, time: new Date().toISOString(), version: env.release ?? null };
  } catch {
    return status(503, { ok: false as const, db: false as const, ms: Date.now() - started, time: new Date().toISOString() });
  }
});
