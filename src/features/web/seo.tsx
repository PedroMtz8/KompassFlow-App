import Head from 'expo-router/head';

/** URL pública del sitio (la misma que usa `+html.tsx`), para canonical y Open Graph. */
const SITE = (process.env.EXPO_PUBLIC_API_URL || process.env.APP_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '');

/**
 * Metadatos propios de cada página web (título, descripción, canonical, Open Graph y Twitter). Salen en el HTML del servidor.
 * `+html.tsx` solo pone lo común a todo el sitio; así no se duplican ni la ficha de una página dice ser otra.
 */
export function PageHead({ title, description, path }: { title: string; description: string; path: string }) {
  const url = SITE ? `${SITE}${path}` : undefined;
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      {url ? <link rel="canonical" href={url} /> : null}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url ? <meta property="og:url" content={url} /> : null}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Head>
  );
}
