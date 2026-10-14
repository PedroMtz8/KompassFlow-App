/**
 * URL pública del sitio (sin «/» final), para robots.txt y sitemap.xml. Solo se usa en el servidor.
 * Prioridad: APP_URL, BETTER_AUTH_URL, y si no, el host con el que llegó la petición (detrás de un proxy: cabeceras x-forwarded-*).
 */
export function siteUrl(request: Request): string {
  const fromEnv = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}
