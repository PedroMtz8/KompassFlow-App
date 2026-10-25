/**
 * Variables de entorno del servidor. Se leen de forma perezosa (getters) para
 * funcionar en Node y en runtimes tipo Workers (EAS Hosting).
 *
 * `src/server/` es autocontenido: no importa nada de `src/app`, React ni React Native,
 * y usa solo imports relativos, para poder copiarlo a otro proyecto.
 */
const clean = (value: string | undefined) => (value && value.length > 0 ? value : undefined);

export const env = {
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get tursoUrl() {
    return clean(process.env.TURSO_DATABASE_URL) ?? 'http://127.0.0.1:8080';
  },
  get tursoToken() {
    return clean(process.env.TURSO_AUTH_TOKEN);
  },
  /** Esquema de deep link de la app (app.json -> expo.scheme). */
  get appScheme() {
    return clean(process.env.APP_SCHEME) ?? 'kompassflow';
  },
  /** URL pública de la app web (enlaces dentro de los correos). */
  get appUrl() {
    return (clean(process.env.APP_URL) ?? clean(process.env.BETTER_AUTH_URL) ?? 'http://localhost:8081').replace(/\/+$/, '');
  },
  /** Resend (correo transaccional). Sin RESEND_API_KEY no se envía nada: en desarrollo el correo se imprime en el log. */
  get resend() {
    const key = clean(process.env.RESEND_API_KEY);
    if (!key) return undefined;
    return {
      key,
      from: clean(process.env.EMAIL_FROM) ?? 'Kompass <onboarding@resend.dev>',
      // Solo se cambia en pruebas (un servidor local que imita a Resend).
      baseUrl: (clean(process.env.RESEND_BASE_URL) ?? 'https://api.resend.com').replace(/\/+$/, ''),
    };
  },
  /** Sentry (errores). Sin SENTRY_DSN los errores solo quedan en el log. */
  get sentry() {
    const dsn = clean(process.env.SENTRY_DSN);
    if (!dsn) return undefined;
    try {
      const u = new URL(dsn);
      const project = u.pathname.replace(/^\/+/, '');
      if (!u.username || !project) return undefined;
      return { key: u.username, endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, dsn };
    } catch {
      return undefined;
    }
  },
  get environment() {
    return clean(process.env.SENTRY_ENVIRONMENT) ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  },
  get release() {
    return clean(process.env.APP_VERSION);
  },
  get google() {
    const clientId = clean(process.env.GOOGLE_CLIENT_ID);
    const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  },
  /** Stripe de la plataforma (suscripciones SaaS de las academias). Sin clave, la facturación queda desactivada. */
  get stripe() {
    const secretKey = clean(process.env.STRIPE_SECRET_KEY);
    const webhookSecret = clean(process.env.STRIPE_WEBHOOK_SECRET);
    return secretKey && webhookSecret ? { secretKey, webhookSecret } : undefined;
  },
  /** Servicio de push de Expo (solo se cambia en pruebas: un servidor local que lo imita). */
  get expoPushUrl() {
    return clean(process.env.EXPO_PUSH_URL) ?? 'https://exp.host/--/api/v2/push/send';
  },
  /** Secreto con el que el planificador (GitHub Actions) llama a los trabajos programados. Sin él, esas rutas responden 503. */
  get cronSecret() {
    return clean(process.env.CRON_SECRET);
  },
  /** Dónde se guardan los contadores del límite de intentos: `memory` (por instancia) o `db` (compartido entre instancias). */
  get rateLimitStore() {
    return clean(process.env.RATE_LIMIT_STORE) === 'db' ? ('db' as const) : ('memory' as const);
  },
  /** Base del API de Stripe (solo pruebas: apunta a un Stripe falso). */
  get stripeApiBase() {
    return clean(process.env.STRIPE_API_BASE) ?? 'https://api.stripe.com/v1';
  },
  /** Comisión de la plataforma sobre los cobros con tarjeta de los alumnos, en puntos base (100 = 1%). 0 = no se cobra. */
  get platformFeeBps() {
    const n = Number(clean(process.env.PLATFORM_FEE_BPS) ?? 0);
    return Number.isInteger(n) && n >= 0 && n <= 3000 ? n : 0;
  },
  /**
   * Comisión por plan de la academia (`PLATFORM_FEE_BPS_FREE`, `_STARTER`, `_PRO`, `_BUSINESS`); la que falte usa `PLATFORM_FEE_BPS`.
   * Ejemplo: planes chicos pagan comisión y Business no (`PLATFORM_FEE_BPS_BUSINESS=0`).
   */
  feeBpsFor(plan: string) {
    const raw = clean(process.env[`PLATFORM_FEE_BPS_${plan.toUpperCase()}`]);
    if (raw === undefined) return this.platformFeeBps;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 3000 ? n : this.platformFeeBps;
  },
  /** Correos de quienes administran la plataforma (separados por coma). Además deben tener el correo confirmado. */
  get platformAdminEmails() {
    return (clean(process.env.PLATFORM_ADMIN_EMAILS) ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  /** Ids de precio (mensuales) de cada plan en Stripe. */
  get stripePrices() {
    return {
      starter: clean(process.env.STRIPE_PRICE_STARTER),
      pro: clean(process.env.STRIPE_PRICE_PRO),
      business: clean(process.env.STRIPE_PRICE_BUSINESS),
    };
  },
  /** Cloudflare R2 (archivos: portadas y fotos de perfil). Sin estas variables el almacenamiento queda desactivado. */
  get r2() {
    const accountId = clean(process.env.R2_ACCOUNT_ID);
    const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID);
    const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
    const bucket = clean(process.env.R2_BUCKET);
    const publicUrl = clean(process.env.R2_PUBLIC_URL)?.replace(/\/+$/, '');
    // R2_ENDPOINT es opcional (pruebas con un S3 local); por defecto es el endpoint de la cuenta.
    const endpoint =
      clean(process.env.R2_ENDPOINT)?.replace(/\/+$/, '') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    return accountId && accessKeyId && secretAccessKey && bucket && publicUrl && endpoint
      ? { accountId, accessKeyId, secretAccessKey, bucket, publicUrl, endpoint }
      : undefined;
  },
};
