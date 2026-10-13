/**
 * Fechas con zona horaria sin dependencias: los instantes se guardan en UTC (ms) y las fechas/horas
 * "de pared" ("2026-10-06" + "19:00") se interpretan en la zona IANA de la organización.
 */
function parts(utcMs: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(utcMs))) if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  return map;
}

/** Desfase de la zona respecto a UTC (ms) en ese instante. */
function offsetMs(utcMs: number, tz: string) {
  const p = parts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-10-06" + "19:00" en `tz` => instante UTC en ms (correcto también en cambios de horario). */
export function zonedTimeToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(first, tz);
  return second;
}

/** Fecha local "YYYY-MM-DD" de un instante en `tz`. */
export function localDate(utcMs: number, tz: string) {
  const p = parts(utcMs, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Día de la semana de una fecha "YYYY-MM-DD" (0 = domingo … 6 = sábado). */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Todas las fechas entre `start` y `end` (incluidas) que caen en alguno de los `weekdays`. */
export function datesInRange(start: string, end: string, weekdays: number[]) {
  const out: string[] = [];
  const wanted = new Set(weekdays);
  for (let d = start, guard = 0; d <= end && guard < 400; d = addDays(d, 1), guard++) if (wanted.has(weekdayOf(d))) out.push(d);
  return out;
}

/** ¿Es un identificador de zona horaria IANA válido (p. ej. «America/Mazatlan»)? */
export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
