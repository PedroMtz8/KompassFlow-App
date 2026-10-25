import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { organization } from 'better-auth/plugins';

import { stripePlans } from '../billing/plan-config';
import { db, schema } from '../db';
import { isSuspended } from '../db/admin';
import { getMemberRole } from '../db/organizations';
import { assignDefaultVertical } from '../db/catalog';
import { sendResetPassword, sendVerifyEmail } from '../emails/send';
import { env } from '../env';
import { ac, roles } from './permissions';

/**
 * Better Auth: credenciales (email + contraseña) y Google.
 * Google se activa solo si existen GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.
 * Plugin `organization`: organizaciones, miembros, roles e invitaciones.
 *
 * Tras cambiar plugins o campos: `npm run auth:generate` y luego `npm run db:generate`.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- carga diferida del SDK de Stripe (ver abajo) */
/** Correos para los que NO se envía la confirmación al crear la cuenta (la crea una academia). */
const quiet = ((globalThis as { __quietVerify?: Set<string> }).__quietVerify ??= new Set<string>());
export const withoutVerificationEmail = async <T>(email: string, run: () => Promise<T>) => {
  quiet.add(email.toLowerCase());
  try {
    return await run();
  } finally {
    quiet.delete(email.toLowerCase());
  }
};

export const auth = betterAuth({
  appName: 'Kompass',
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    // El enlace sirve 1 hora. Sin `await`: responder igual de rápido exista o no la cuenta (no revela qué correos están registrados).
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) => {
      void sendResetPassword(user, url);
    },
  },
  // Confirmación de correo: se envía al registrarse. No bloquea el acceso (las cuentas que crea una academia nacen sin
  // confirmar), pero aceptar invitaciones sí la exige.
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 24 * 3600,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Las cuentas que crea una academia no mandan correo al nacer (la academia pudo escribir mal el correo): se les avisa con sus credenciales.
      if (quiet.has(user.email.toLowerCase())) return;
      void sendVerifyEmail(user, url);
    },
  },
  socialProviders: {
    ...(env.google ? { google: env.google } : {}),
  },
  // Una persona puede entrar con correo y contraseña Y con Google en la misma cuenta. Google verifica el correo, así que
  // entrar con él al mismo correo se une a la cuenta existente; desde el perfil también se puede vincular un Google con
  // otro correo (quien lo hace ya tiene la sesión iniciada). No se permite quitar el único método de acceso.
  // Campos propios de la cuenta (no los puede escribir el cliente: `input: false`).
  user: {
    additionalFields: {
      mustChangePassword: { type: 'boolean', defaultValue: false, input: false },
      tempPasswordExpiresAt: { type: 'date', required: false, input: false },
      managedByOrgId: { type: 'string', required: false, input: false },
    },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'], allowDifferentEmails: true, allowUnlinkingAll: false },
  },
  // Límite de peticiones de Better Auth (inicio de sesión, registro…). En producción se guarda en la base para que lo compartan
  // todas las instancias (en memoria cada una llevaría su propia cuenta).
  rateLimit: { storage: env.rateLimitStore === 'db' ? 'database' : 'memory' },
  // Orígenes permitidos para deep links / callbacks. En desarrollo Expo usa exp://.
  trustedOrigins: [
    `${env.appScheme}://`,
    ...(env.isProduction ? [] : ['exp://', 'exp://192.168.*.*:*/**', 'exp://10.*.*.*:*/**', 'exp://172.*.*.*:*/**']),
  ],
  // Todo usuario nuevo arranca con el rubro por defecto (Baile); el paso de rubros del onboarding
  // solo aparece cuando haya más de un rubro activo.
  databaseHooks: {
    user: { create: { after: async (u) => assignDefaultVertical(u.id) } },
    // Una cuenta suspendida por la administración no puede abrir sesión (las que tenía abiertas se cerraron al suspenderla).
    session: {
      create: {
        before: async (s) => {
          if (await isSuspended(s.userId)) throw new APIError('FORBIDDEN', { message: 'Tu cuenta está suspendida. Escríbenos si crees que es un error.' });
        },
      },
    },
  },
  plugins: [
    expo(),
    // Las organizaciones se crean SOLO por nuestra API (`POST /api/orgs`), que agrega el detalle de
    // dominio (tipo, rubro, sede) de forma atómica; por eso se desactiva la creación directa del plugin.
    // Roles del sistema en código (`roles`) + roles personalizados por organización (`dynamicAccessControl`).
    organization({
      ac,
      roles,
      allowUserToCreateOrganization: false,
      dynamicAccessControl: { enabled: true, maximumRolesPerOrganization: 20 },
    }),
    // Suscripción SaaS por organización (PRD §13.1). Sin claves de Stripe el plugin no se carga y
    // la facturación queda desactivada: cada organización usa los límites del plan Gratis.
    // `require` y no `import`: así Metro solo evalúa el SDK de Stripe cuando hay claves (en desarrollo cada
    // petición vuelve a evaluar este módulo, y el SDK pesa decenas de MB).
    ...(env.stripe
      ? [
          (require('@better-auth/stripe') as typeof import('@better-auth/stripe')).stripe({
            stripeClient: new (require('stripe') as typeof import('stripe').default)(env.stripe.secretKey),
            stripeWebhookSecret: env.stripe.webhookSecret,
            createCustomerOnSignUp: false,
            // Cobros con tarjeta de los alumnos (Connect): llegan por el mismo webhook que las suscripciones.
            // `import()` diferido: así `auth` no carga los módulos de pagos al arrancar (y no hay ciclos).
            onEvent: async (event) => (await import('../db/connect')).handleStripeEvent(event as never),
            organization: { enabled: true },
            subscription: {
              enabled: true,
              plans: stripePlans,
              // Solo quien puede administrar la facturación (propietario) gestiona la suscripción.
              authorizeReference: async ({ user, referenceId }) => (await getMemberRole(user.id, referenceId)) === 'owner',
            },
          }),
        ]
      : []),
  ],
});

export type Auth = typeof auth;
