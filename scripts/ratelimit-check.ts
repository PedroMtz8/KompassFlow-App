/**
 * Prueba del limitador de intentos compartido (almacén en base de datos):
 *  - con 30 intentos simultáneos solo pasan exactamente `limit` (la cuenta es atómica);
 *  - cada clave lleva su propia cuenta y la ventana se libera al vencer;
 *  - dos "instancias" del servidor (memoria distinta) comparten la cuenta porque está en la base;
 *  - si la base falla, no se bloquea a todos: se cae al límite en memoria y sigue limitando;
 *  - el modo en memoria (por defecto) sigue funcionando igual.
 *   RATE_LIMIT_STORE=db bun --env-file=.env scripts/ratelimit-check.ts
 */
process.env.RATE_LIMIT_STORE = 'db';
const { db } = await import('../src/server/db');
const { allow, allowLocal } = await import('../src/server/lib/rate-limit');
const { sql } = await import('drizzle-orm');

const out: [string, boolean, string?][] = [];
const tag = `zz-rl-${Date.now()}`;
try {
  const burst = await Promise.all(Array.from({ length: 30 }, () => allow(`${tag}:a`, 5, 60_000)));
  out.push(['30 intentos simultáneos: pasan exactamente 5', burst.filter(Boolean).length === 5, `${burst.filter(Boolean).length}`]);
  out.push(['Otra clave no se ve afectada', (await allow(`${tag}:b`, 5, 60_000)) === true]);
  out.push(['La clave agotada sigue bloqueada', (await allow(`${tag}:a`, 5, 60_000)) === false]);
  out.push(['Al vencer la ventana vuelve a permitir', (await allow(`${tag}:a`, 5, 60_000, Date.now() + 61_000)) === true]);

  // Otra "instancia": su memoria local está vacía, pero la cuenta vive en la base.
  const g = globalThis as { __rateLimit?: Map<string, number[]> };
  g.__rateLimit?.clear();
  out.push(['Otra instancia (memoria vacía) ve la misma cuenta', (await allow(`${tag}:a`, 5, 60_000, Date.now() + 61_000 + 1)) === true && (await Promise.all(Array.from({ length: 10 }, () => allow(`${tag}:a`, 5, 60_000, Date.now() + 61_000 + 1)))).filter(Boolean).length <= 3]);

  const row = await db.run(sql`SELECT count FROM app_rate_limit WHERE key = ${tag + ':b'}`);
  out.push(['El contador está guardado en la base', Number(row.rows[0]?.count ?? row.rows[0]?.[0]) === 1]);

  // La base falla: se sigue limitando en memoria.
  await db.run(sql`ALTER TABLE app_rate_limit RENAME TO app_rate_limit_x`);
  const origErr = console.error;
  console.error = () => {};
  const fallback = await Promise.all(Array.from({ length: 12 }, () => allow(`${tag}:c`, 4, 60_000)));
  console.error = origErr;
  await db.run(sql`ALTER TABLE app_rate_limit_x RENAME TO app_rate_limit`);
  out.push(['Con la base caída no se bloquea a todos y sigue limitando', fallback.filter(Boolean).length === 4, `${fallback.filter(Boolean).length}`]);

  // Memoria siempre disponible (rutas que no deben tocar la base).
  const local = Array.from({ length: 8 }, () => allowLocal(`${tag}:d`, 3, 60_000)).filter(Boolean).length;
  out.push(['El límite local nunca toca la base', local === 3]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  await db.run(sql`DELETE FROM app_rate_limit WHERE key LIKE ${tag + '%'}`).catch(() => {});
  process.exit(process.exitCode ?? 0);
}
