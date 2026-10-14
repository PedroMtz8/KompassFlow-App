import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Documento HTML de la web: idioma, SEO (título, descripción, Open Graph, Twitter, datos estructurados) y reinicio de estilos.
 * Se renderiza en el servidor, así que los buscadores y las vistas previas de redes ven todo sin ejecutar JavaScript.
 * La URL pública sale de `EXPO_PUBLIC_API_URL` (la misma de la app), o de `APP_URL`/`BETTER_AUTH_URL` en el servidor.
 */
const SITE = (process.env.EXPO_PUBLIC_API_URL || process.env.APP_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '');

const NAME = 'KompassFlow';
const TITLE = 'KompassFlow · La agenda de tu academia de baile';
const DESCRIPTION =
  'Publica tus clases, controla el cupo, cobra y pasa lista desde un solo lugar. Y si bailas, encuentra una clase cerca y reserva en dos toques.';
const THEME = '#F5EFE3';

const abs = (path: string) => (SITE ? `${SITE}${path}` : path);

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${abs('/')}#org`, name: NAME, url: abs('/'), logo: abs('/og-image.png') },
    { '@type': 'WebSite', '@id': `${abs('/')}#site`, url: abs('/'), name: NAME, description: DESCRIPTION, inLanguage: 'es', publisher: { '@id': `${abs('/')}#org` } },
    {
      '@type': 'SoftwareApplication',
      name: NAME,
      description: DESCRIPTION,
      url: abs('/'),
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      inLanguage: 'es',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN' },
    },
  ],
};

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta name="theme-color" content={THEME} />
        <meta name="application-name" content={NAME} />
        {SITE ? <link rel="canonical" href={abs('/')} /> : null}

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={NAME} />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        {SITE ? <meta property="og:url" content={abs('/')} /> : null}
        <meta property="og:image" content={abs('/og-image.png')} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="KompassFlow: la agenda de tu academia, al compás" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={abs('/og-image.png')} />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
