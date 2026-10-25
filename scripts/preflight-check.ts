/**
 * Prueba de la revisión de producción: una configuración completa pasa sin bloqueos y cada error típico
 * (llaves de prueba, localhost, remitente de pruebas, bundle id de ejemplo, secreto débil…) se detecta.
 *   bun scripts/preflight-check.ts
 */
import { checkProduction, summary } from './lib/preflight-core';

const good = {
  TURSO_DATABASE_URL: 'libsql://stagelight-prod-acme.turso.io',
  TURSO_AUTH_TOKEN: 'tok',
  BETTER_AUTH_URL: 'https://app.stagelight.mx',
  APP_URL: 'https://app.stagelight.mx',
  EXPO_PUBLIC_API_URL: 'https://app.stagelight.mx',
  BETTER_AUTH_SECRET: 'N2Fm9xQ0c1pVYk3uZr8bT4wLhJd6sEoA+gRiU5yXvMc=',
  RATE_LIMIT_STORE: 'db',
  CRON_SECRET: 'm7Q2xv9LkT4pR8sWzY1bN6cHdJ3fGaE0uXo5iV=',
  RESEND_API_KEY: 're_live_xxx',
  EMAIL_FROM: 'Kompass <hola@stagelight.mx>',
  STRIPE_SECRET_KEY: 'sk_live_abc',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_def',
  STRIPE_PRICE_STARTER: 'price_1',
  STRIPE_PRICE_PRO: 'price_2',
  STRIPE_PRICE_BUSINESS: 'price_3',
  R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'stagelight-public', R2_PUBLIC_URL: 'https://cdn.stagelight.mx',
  R2_BACKUP_BUCKET: 'stagelight-backups',
  BACKUP_ENCRYPTION_KEY: 'k3Jx9Lm2Pq8Rt5Vw1Yz4Bc7Df0Gh6Jn3Qs8Tu1Xa5Zc=',
  SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
  EXPO_PUBLIC_LEGAL_NAME: 'Kompass SA de CV', EXPO_PUBLIC_LEGAL_ADDRESS: 'Calle 1, Tepic', EXPO_PUBLIC_LEGAL_SUPPORT_EMAIL: 'soporte@stagelight.mx',
  GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'h',
};
const app = { expo: { ios: { bundleIdentifier: 'mx.stagelight.app' }, android: { package: 'mx.stagelight.app' } } };

const out: [string, boolean, string?][] = [];
const blockersOf = (v: Record<string, string | undefined>, a = app) => checkProduction(v, a).filter((f) => f.level === 'blocker').map((f) => f.area);
const g = checkProduction(good, app);
out.push(['Una configuración completa no tiene bloqueos ni avisos', summary(g).blockers === 0 && summary(g).warnings === 0, JSON.stringify(summary(g))]);

const cases: [string, Record<string, string | undefined>, string, typeof app?][] = [
  ['Base local', { ...good, TURSO_DATABASE_URL: 'file:local.db' }, 'Base de datos'],
  ['Base en localhost', { ...good, TURSO_DATABASE_URL: 'http://127.0.0.1:8080' }, 'Base de datos'],
  ['Sin token de la base', { ...good, TURSO_AUTH_TOKEN: '' }, 'Base de datos'],
  ['BETTER_AUTH_URL con http', { ...good, BETTER_AUTH_URL: 'http://app.stagelight.mx' }, 'Direcciones'],
  ['APP_URL de localhost', { ...good, APP_URL: 'http://localhost:8081' }, 'Direcciones'],
  ['APP_URL de otro sitio', { ...good, APP_URL: 'https://otro.com' }, 'Direcciones'],
  ['Sin EXPO_PUBLIC_API_URL', { ...good, EXPO_PUBLIC_API_URL: undefined }, 'Direcciones'],
  ['Secreto corto', { ...good, BETTER_AUTH_SECRET: 'abc123' }, 'Seguridad'],
  ['Secreto de pruebas', { ...good, BETTER_AUTH_SECRET: 'secreto-solo-para-pruebas-0123456789abcdef' }, 'Seguridad'],
  ['Sin secreto para los recordatorios', { ...good, CRON_SECRET: undefined }, 'Recordatorios'],
  ['Límite de intentos en memoria', { ...good, RATE_LIMIT_STORE: undefined }, 'Seguridad'],
  ['Sin Resend', { ...good, RESEND_API_KEY: undefined }, 'Correo'],
  ['Remitente de pruebas de Resend', { ...good, EMAIL_FROM: 'Kompass <onboarding@resend.dev>' }, 'Correo'],
  ['Stripe en modo de prueba', { ...good, STRIPE_SECRET_KEY: 'sk_test_abc' }, 'Stripe'],
  ['Sin secreto del webhook', { ...good, STRIPE_WEBHOOK_SECRET: undefined }, 'Stripe'],
  ['Sin secreto del webhook de cuentas conectadas', { ...good, STRIPE_CONNECT_WEBHOOK_SECRET: undefined }, 'Stripe'],
  ['Falta un precio', { ...good, STRIPE_PRICE_PRO: '' }, 'Stripe'],
  ['Respaldos al mismo bucket público', { ...good, R2_BACKUP_BUCKET: 'stagelight-public' }, 'Respaldos'],
  ['Sin clave de cifrado de respaldos', { ...good, BACKUP_ENCRYPTION_KEY: undefined }, 'Respaldos'],
  ['Sin datos legales', { ...good, EXPO_PUBLIC_LEGAL_NAME: '' }, 'Legal'],
  ['Bundle id de ejemplo (iOS)', good, 'Tiendas', { expo: { ios: { bundleIdentifier: 'com.example.expostarter' }, android: app.expo.android } }],
  ['Paquete de ejemplo (Android)', good, 'Tiendas', { expo: { ios: app.expo.ios, android: { package: 'com.example.expostarter' } } }],
];
for (const [name, vars, area, appOverride] of cases) out.push([`Detecta: ${name}`, blockersOf(vars, appOverride ?? app).includes(area), area]);

const noStripe = checkProduction({ ...good, STRIPE_SECRET_KEY: undefined }, app);
out.push(['Sin Stripe es un aviso (no bloquea)', summary(noStripe).blockers === 0 && noStripe.some((f) => f.area === 'Stripe' && f.level === 'warning')]);
const noSentry = checkProduction({ ...good, SENTRY_DSN: undefined, GOOGLE_CLIENT_ID: undefined }, app);
out.push(['Sin Sentry ni Google son avisos (no bloquean)', summary(noSentry).blockers === 0 && summary(noSentry).warnings === 2]);
out.push(['Nunca se imprime ningún valor secreto', !JSON.stringify(checkProduction({ ...good, STRIPE_SECRET_KEY: 'sk_test_SUPERSECRETO' }, app)).includes('SUPERSECRETO')]);

for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail && !ok ? ' — ' + detail : ''}`);
if (out.some(([, ok]) => !ok)) process.exitCode = 1;
else console.log(`\n${out.length} comprobaciones pasaron.`);
