/**
 * Revisión de configuración para salir a producción. Es una función pura (recibe las variables y el app.json) para poder
 * probarla sin tocar nada. `blocker` = no se debe publicar así; `warning` = se puede, pero conviene resolverlo.
 */
export type Finding = { level: 'blocker' | 'warning' | 'ok'; area: string; message: string };

type Vars = Record<string, string | undefined>;
type AppJson = { expo?: { ios?: { bundleIdentifier?: string }; android?: { package?: string }; scheme?: string } };

const has = (v: string | undefined) => !!v && v.trim().length > 0;
const isLocal = (u: string) => /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/i.test(u);
const origin = (u: string | undefined) => {
  try {
    return u ? new URL(u).origin : undefined;
  } catch {
    return undefined;
  }
};

export function checkProduction(v: Vars, app: AppJson = {}): Finding[] {
  const out: Finding[] = [];
  const add = (level: Finding['level'], area: string, message: string) => out.push({ level, area, message });
  const must = (cond: boolean, area: string, bad: string, good: string) => (cond ? add('ok', area, good) : add('blocker', area, bad));
  const should = (cond: boolean, area: string, bad: string, good: string) => (cond ? add('ok', area, good) : add('warning', area, bad));

  // ── Base de datos ──────────────────────────────────────────────────────────
  const db = v.TURSO_DATABASE_URL ?? '';
  must(/^(libsql|https|wss):\/\//.test(db) && !isLocal(db), 'Base de datos', 'TURSO_DATABASE_URL debe apuntar a tu base de Turso (libsql://…), no a un archivo ni a localhost.', 'Base de datos remota.');
  must(has(v.TURSO_AUTH_TOKEN), 'Base de datos', 'Falta TURSO_AUTH_TOKEN.', 'Token de la base presente.');

  // ── Direcciones públicas ───────────────────────────────────────────────────
  const auth = v.BETTER_AUTH_URL ?? '';
  must(/^https:\/\//.test(auth) && !isLocal(auth), 'Direcciones', 'BETTER_AUTH_URL debe ser la dirección pública con https:// (sin localhost).', 'BETTER_AUTH_URL con https.');
  must(has(v.APP_URL) && /^https:\/\//.test(v.APP_URL!) && !isLocal(v.APP_URL!), 'Direcciones', 'APP_URL debe ser la dirección pública con https:// (los enlaces de los correos salen de aquí).', 'APP_URL con https.');
  must(!has(v.APP_URL) || !has(auth) || origin(v.APP_URL) === origin(auth), 'Direcciones', 'APP_URL y BETTER_AUTH_URL deben ser el mismo sitio.', 'APP_URL y BETTER_AUTH_URL coinciden.');
  must(has(v.EXPO_PUBLIC_API_URL) && origin(v.EXPO_PUBLIC_API_URL) === origin(auth), 'Direcciones', 'EXPO_PUBLIC_API_URL debe ser la misma dirección pública: las apps nativas no saben dónde está el servidor sin ella.', 'La app nativa apunta al servidor público.');

  // ── Seguridad ──────────────────────────────────────────────────────────────
  const secret = v.BETTER_AUTH_SECRET ?? '';
  must(secret.length >= 32 && !/prueba|test|changeme|secret/i.test(secret), 'Seguridad', 'BETTER_AUTH_SECRET debe ser aleatorio de 32+ caracteres (openssl rand -base64 32), no uno de pruebas.', 'Secreto de sesiones robusto.');
  must(v.RATE_LIMIT_STORE === 'db', 'Seguridad', 'Define RATE_LIMIT_STORE=db: sin él el límite de intentos es por instancia y se puede esquivar con varias.', 'Límite de intentos compartido.');

  must((v.CRON_SECRET ?? '').length >= 24, 'Recordatorios', 'Define CRON_SECRET (openssl rand -base64 32) y el mismo valor como secret CRON_SECRET (más APP_URL) en GitHub: sin él no salen los recordatorios de clase.', 'Secreto de los recordatorios.');

  // ── Correo ─────────────────────────────────────────────────────────────────
  must(has(v.RESEND_API_KEY), 'Correo', 'Falta RESEND_API_KEY: nadie recibiría los correos de recuperar contraseña ni de confirmación.', 'Resend configurado.');
  const from = v.EMAIL_FROM ?? '';
  must(has(from) && !/resend\.dev/i.test(from), 'Correo', 'EMAIL_FROM debe ser de tu dominio verificado en Resend (con onboarding@resend.dev solo llega a tu propio correo).', 'Remitente de tu dominio.');

  // ── Pagos (Stripe) ─────────────────────────────────────────────────────────
  if (has(v.STRIPE_SECRET_KEY)) {
    must(/^sk_live_/.test(v.STRIPE_SECRET_KEY!), 'Stripe', 'STRIPE_SECRET_KEY es de PRUEBA (sk_test_…): en producción no cobraría dinero real.', 'Llave de Stripe en modo real.');
    must(/^whsec_/.test(v.STRIPE_WEBHOOK_SECRET ?? ''), 'Stripe', 'Falta STRIPE_WEBHOOK_SECRET (el del webhook real creado en el panel, que incluya cuentas conectadas).', 'Secreto del webhook presente.');
    must(/^whsec_/.test(v.STRIPE_CONNECT_WEBHOOK_SECRET ?? ''), 'Stripe', 'Falta STRIPE_CONNECT_WEBHOOK_SECRET (el secreto del destino "Cuentas conectadas" hacia /api/stripe/connect-webhook): sin él no llegan los pagos con tarjeta de los alumnos.', 'Secreto del webhook de cuentas conectadas.');
    for (const k of ['STARTER', 'PRO', 'BUSINESS'] as const)
      must(/^price_/.test(v[`STRIPE_PRICE_${k}`] ?? ''), 'Stripe', `Falta STRIPE_PRICE_${k} (créalo en modo real: los ids de prueba no sirven).`, `Precio ${k.toLowerCase()} presente.`);
  } else {
    add('warning', 'Stripe', 'Sin STRIPE_SECRET_KEY la facturación queda apagada: no se cobran planes ni pagos con tarjeta, y las academias no tendrían límites de plan.');
  }

  // ── Archivos y respaldos ───────────────────────────────────────────────────
  const r2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  should(r2.every((k) => has(v[k])), 'Archivos', 'Faltan variables de R2: las portadas y fotos no se podrán subir.', 'R2 configurado.');
  must(has(v.R2_BACKUP_BUCKET) && v.R2_BACKUP_BUCKET !== v.R2_BUCKET, 'Respaldos', 'Define R2_BACKUP_BUCKET (un bucket PRIVADO distinto al de imágenes) para los respaldos diarios.', 'Bucket de respaldos aparte.');
  must((v.BACKUP_ENCRYPTION_KEY ?? '').length >= 32, 'Respaldos', 'Falta BACKUP_ENCRYPTION_KEY (openssl rand -base64 32); guárdala también en tu gestor de contraseñas: sin ella no se restaura.', 'Clave de cifrado de respaldos.');

  // ── Monitoreo ──────────────────────────────────────────────────────────────
  should(has(v.SENTRY_DSN), 'Monitoreo', 'Sin SENTRY_DSN los errores solo quedan en el log del servidor.', 'Sentry configurado.');

  // ── Identidad de la app y textos legales ───────────────────────────────────
  const ios = app.expo?.ios?.bundleIdentifier ?? '';
  const android = app.expo?.android?.package ?? '';
  must(has(ios) && !/^com\.example\./.test(ios), 'Tiendas', `ios.bundleIdentifier es «${ios || 'vacío'}»: pon el tuyo (p. ej. com.tuempresa.stagelight) en app.json; no se puede cambiar después de publicar.`, 'Bundle ID de iOS propio.');
  must(has(android) && !/^com\.example\./.test(android), 'Tiendas', `android.package es «${android || 'vacío'}»: pon el tuyo en app.json; no se puede cambiar después de publicar.`, 'Paquete de Android propio.');
  must(['EXPO_PUBLIC_LEGAL_NAME', 'EXPO_PUBLIC_LEGAL_ADDRESS', 'EXPO_PUBLIC_LEGAL_SUPPORT_EMAIL'].every((k) => has(v[k])), 'Legal', 'Faltan EXPO_PUBLIC_LEGAL_NAME / _ADDRESS / _SUPPORT_EMAIL: el aviso de privacidad y los términos mostrarían datos vacíos. Haz que un abogado los revise.', 'Datos legales presentes.');
  should(has(v.GOOGLE_CLIENT_ID) && has(v.GOOGLE_CLIENT_SECRET), 'Acceso', 'Sin Google OAuth el botón «Continuar con Google» no funciona (agrega la URI de redirección de producción).', 'Google configurado.');

  return out;
}

export const summary = (f: Finding[]) => ({
  blockers: f.filter((x) => x.level === 'blocker').length,
  warnings: f.filter((x) => x.level === 'warning').length,
  ok: f.filter((x) => x.level === 'ok').length,
});
