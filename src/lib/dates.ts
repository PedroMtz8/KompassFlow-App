/**
 * Fechas de negocio en la zona horaria de la organización (nunca la del dispositivo):
 * el servidor guarda UTC y el cliente muestra en la zona de la organización.
 */
export const DEFAULT_TZ = 'America/Mazatlan';

export function localDateOf(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p; // en-CA => YYYY-MM-DD
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lunes de la semana que contiene `date`. */
export function startOfWeek(date: string) {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function formatTime(ms: number | string | Date, tz: string) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

const utcNoon = (date: string) => new Date(`${date}T12:00:00Z`);

export const weekdayShort = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short' }).format(utcNoon(date)).replace('.', '');
export const dayNumber = (date: string) => date.slice(8).replace(/^0/, '');
export const monthShort = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'short' }).format(utcNoon(date)).replace('.', '');
export const longDate = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(utcNoon(date));

/** Cuántas fechas entre `start` y `end` (incluidas) caen en `weekdays`. */
export function countDates(start: string, end: string, weekdays: number[]) {
  let n = 0;
  for (let d = start, g = 0; d <= end && g < 400; d = addDays(d, 1), g++) if (weekdays.includes(weekdayOf(d))) n++;
  return n;
}

const currencyFmt = (currency: string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 });
/** Centavos -> "$180". */
export const formatMoney = (cents: number, currency = 'MXN') => currencyFmt(currency).format(cents / 100);

/**
 * El cliente de la API (Eden) convierte solo los textos con forma de fecha ("2026-10-06") en `Date`.
 * Esta utilidad devuelve siempre "YYYY-MM-DD", venga como texto o ya convertido.
 */
export const asDateString = (v: string | Date) => (typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/** "Hoy", "Mañana" o "mié 2 oct", en la zona horaria dada. */
export function relativeDay(ms: number, tz: string) {
  const d = localDateOf(ms, tz);
  const today = localDateOf(Date.now(), tz);
  if (d === today) return 'Hoy';
  if (d === addDays(today, 1)) return 'Mañana';
  return `${weekdayShort(d)} ${dayNumber(d)} ${monthShort(d)}`;
}
