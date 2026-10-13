/**
 * Enlaces de Google Maps: se validan (solo dominios de Google, https) y se intenta extraer las
 * coordenadas exactas, que son más precisas que el centro de la colonia.
 */
const DIRECT_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com', 'www.google.com.mx', 'google.com.mx']);
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

export type ParsedMapsUrl = { url: string; lat: number | null; lng: number | null };

function coordsFrom(text: string): { lat: number; lng: number } | null {
  const patterns = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, // dato del lugar (el más exacto)
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // centro del mapa
    /[?&](?:q|ll|query|destination)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

const isAllowed = (u: URL) => u.protocol === 'https:' && (DIRECT_HOSTS.has(u.hostname) || SHORT_HOSTS.has(u.hostname));
const isGoogleMapsPath = (u: URL) => SHORT_HOSTS.has(u.hostname) || u.hostname === 'maps.google.com' || u.pathname.startsWith('/maps');

/** Valida el enlace y resuelve coordenadas. Los enlaces cortos se siguen un salto, solo hacia dominios de Google. */
export async function parseMapsUrl(raw: string): Promise<ParsedMapsUrl | { error: 'INVALID_MAPS_URL' }> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: 'INVALID_MAPS_URL' };
  }
  if (!isAllowed(u) || !isGoogleMapsPath(u)) return { error: 'INVALID_MAPS_URL' };

  let full = u.toString();
  let c = coordsFrom(decodeURIComponent(full));

  if (!c && SHORT_HOSTS.has(u.hostname)) {
    try {
      const res = await fetch(full, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
      const next = res.headers.get('location');
      if (next) {
        const n = new URL(next, full);
        if (isAllowed(n)) {
          c = coordsFrom(decodeURIComponent(n.toString()));
        }
      }
    } catch {
      /* sin red o lento: se guarda el enlace sin coordenadas */
    }
  }
  return { url: full, lat: c?.lat ?? null, lng: c?.lng ?? null };
}
