import { siteUrl } from '@/lib/site-url';

/** robots.txt: se puede rastrear la página pública; la API y las pantallas privadas no. */
export function GET(request: Request) {
  const site = siteUrl(request);
  const body = [
    'User-agent: *',
    'Allow: /$',
    'Allow: /sign-in',
    'Allow: /sign-up',
    'Allow: /terms',
    'Allow: /privacy',
    'Disallow: /api/',
    'Disallow: /force-password',
    'Disallow: /reset-password',
    'Disallow: /recover-access',
    'Disallow: /payment-result',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
