/**
 * Zonas horarias. Una clase se guarda como un instante fijo (UTC) y se muestra en la hora de la ACADEMIA, no en la del
 * dispositivo; así «18:00» significa lo mismo para quien la da y para quien la reserva viaje donde viaje. Estas
 * utilidades sirven para elegir la zona de la academia y avisar cuando el dispositivo está en otra.
 */

/** Zonas de México (y su nombre común) para elegir la de la academia. */
export const MX_ZONES = [
  { id: 'America/Mexico_City', label: 'Centro', note: 'CDMX, Jalisco, Nuevo León, Puebla…' },
  { id: 'America/Mazatlan', label: 'Pacífico', note: 'Nayarit, Sinaloa, Baja California Sur' },
  { id: 'America/Chihuahua', label: 'Centro (Chihuahua)', note: 'Chihuahua' },
  { id: 'America/Hermosillo', label: 'Sonora', note: 'Sonora (sin horario de verano)' },
  { id: 'America/Tijuana', label: 'Noroeste', note: 'Baja California' },
  { id: 'America/Cancun', label: 'Sureste', note: 'Quintana Roo' },
  { id: 'America/Bahia_Banderas', label: 'Centro (Bahía de Banderas)', note: 'Bahía de Banderas, Nayarit' },
] as const;

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Diferencia con UTC, en minutos, de `tz` en el instante `at` (considera horario de verano). */
export function offsetMinutes(tz: string, at: number = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
}

/** «GMT-7», «GMT-5:30»… */
export function gmtLabel(tz: string, at?: number) {
  const m = offsetMinutes(tz, at);
  const sign = m < 0 ? '-' : '+';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `GMT${sign}${h}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
}

/** Nombre legible: el de nuestra lista, o la ciudad del identificador («America/Bogota» → «Bogota»). */
export function zoneName(tz: string) {
  return MX_ZONES.find((z) => z.id === tz)?.label ?? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}

/** ¿El dispositivo marca una hora distinta a la de la zona `tz` en este momento? */
export function differsFromDevice(tz: string, at?: number) {
  return offsetMinutes(tz, at) !== offsetMinutes(deviceTimeZone(), at);
}

/** La zona del dispositivo si está en nuestra lista (o la primera coincidencia por desfase), para proponerla al crear. */
export function suggestedZone() {
  const dev = deviceTimeZone();
  if (MX_ZONES.some((z) => z.id === dev)) return dev;
  return MX_ZONES.find((z) => offsetMinutes(z.id) === offsetMinutes(dev))?.id ?? 'America/Mexico_City';
}

/** Hora «HH:MM» de un instante en una zona. */
export function clock(at: number | string | Date, tz: string) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
}
