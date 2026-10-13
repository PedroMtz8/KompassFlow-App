import { sql } from 'drizzle-orm';

import { db } from '../db';
import { env } from '../env';
import { reportError } from './report';

/**
 * Límite de intentos para rutas que se pueden abusar: canje de códigos, contraseña, reservas, pagos.
 *
 * Dos almacenes:
 *  - memoria (por defecto): ventana deslizante por instancia del servidor. Sirve en desarrollo y con una sola instancia.
 *  - base de datos (`RATE_LIMIT_STORE=db`, recomendado en producción): ventana fija compartida entre TODAS las instancias,
 *    con una sola sentencia atómica por intento. Si la base falla, se cae al almacén de memoria (nunca se bloquea a todos).
 *
 * Ninguno sustituye a un límite en el borde (Cloudflare/WAF) contra un ataque distribuido.
 * El estado en memoria vive en `globalThis` porque en desarrollo Expo reevalúa los módulos en cada petición.
 */
type Store = Map<string, number[]>;
const g = globalThis as { __rateLimit?: Store };
const store: Store = (g.__rateLimit ??= new Map());

/** Límite en memoria SIEMPRE (sin tocar la base): para rutas que deben funcionar aunque la base esté caída. */
export function allowLocal(key: string, limit: number, windowMs: number, now = Date.now()) {
  return allowInMemory(key, limit, windowMs, now);
}

function allowInMemory(key: string, limit: number, windowMs: number, now: number) {
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  // Limpieza ocasional para que el mapa no crezca sin fin.
  if (store.size > 5000) for (const [k, v] of store) if (!v.some((t) => now - t < windowMs)) store.delete(k);
  return true;
}

async function allowInDb(key: string, limit: number, windowMs: number, now: number) {
  // Una sola sentencia: abre la ventana si venció (cuenta 1) o suma uno. Devuelve el contador resultante.
  const res = await db.run(sql`
    INSERT INTO app_rate_limit (key, count, window_start) VALUES (${key}, 1, ${now})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN ${now} - window_start >= ${windowMs} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN ${now} - window_start >= ${windowMs} THEN ${now} ELSE window_start END
    RETURNING count`);
  const count = Number(res.rows[0]?.count ?? res.rows[0]?.[0] ?? 1);
  // Limpieza ocasional de ventanas viejas (nada dura más de una hora).
  if (Math.random() < 0.01) void db.run(sql`DELETE FROM app_rate_limit WHERE window_start < ${now - 3600_000}`).catch(() => {});
  return count <= limit;
}

/** Registra un intento. Devuelve `false` si `key` ya llegó a `limit` intentos dentro de `windowMs`. */
export async function allow(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (env.rateLimitStore === 'db') {
    try {
      return await allowInDb(key, limit, windowMs, now);
    } catch (e) {
      reportError(e, { source: 'rate-limit', level: 'warning' });
    }
  }
  return allowInMemory(key, limit, windowMs, now);
}
