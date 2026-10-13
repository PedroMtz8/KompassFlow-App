import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';

import { authPlugin } from './auth/plugin';
import { reportError } from './lib/report';
import { validationMessage } from './lib/validation-message';
import { clientErrorsModule } from './modules/client-errors';
import { healthModule } from './modules/health';
import { connectModule } from './modules/connect';
import { waitlistModule } from './modules/waitlist';
import { stripeWebhookModule } from './modules/stripe-webhook';
import { interestsModule } from './modules/interests';
import { notificationsModule } from './modules/notifications';
import { meModule } from './modules/me';
import { accountsModule } from './modules/accounts';
import { attendanceModule } from './modules/attendance';
import { billingModule } from './modules/billing';
import { adminModule } from './modules/admin';
import { paymentsModule } from './modules/payments';
import { uploadsModule } from './modules/uploads';
import { privatesModule } from './modules/privates';
import { discoverModule, studentsModule } from './modules/bookings';
import { classesModule } from './modules/classes';
import { orgSpacesModule } from './modules/org-spaces';
import { organizationsModule } from './modules/organizations';
import { rolesModule } from './modules/roles';
import { teamModule } from './modules/team';
import { zonesModule } from './modules/zones';

/**
 * Aplicación Elysia. Es agnóstica del framework: expone `api.fetch(Request) => Response`.
 * Hoy la sirve una ruta +api.ts de Expo Router; mañana puede servirla un servidor
 * independiente (Bun/Node) sin cambiar nada de esta carpeta.
 *
 * - `CloudflareAdapter` + `.compile()`: EAS Hosting corre sobre Cloudflare Workers, que
 *   no permite `new Function` en tiempo de ejecución; el adaptador compila las rutas
 *   por adelantado. También funciona en Node/Bun (probado en Node).
 * - Añade módulos nuevos en `./modules/*` y regístralos con `.use(...)` ANTES de `.compile()`.
 */
export const api = new Elysia({ prefix: '/api', adapter: CloudflareAdapter })
  // Registro de errores de la API (validación, 5xx…). No cambia la respuesta: solo deja rastro en los logs del servidor.
  .onError({ as: 'global' }, ({ code, path, request, error, status }) => {
    if (code === 'NOT_FOUND') return;
    // Un dato rechazado por el esquema: mensaje corto en español. Ni la respuesta ni el log incluyen los valores enviados
    // (podrían ser contraseñas) ni el esquema esperado.
    if (code === 'VALIDATION') {
      const e = error as unknown as { all?: { path?: string; message?: string; summary?: string }[]; message?: string };
      const message = validationMessage(e);
      console.error(`[api] ${request.method} ${path} → VALIDATION: ${e.all?.[0]?.path ?? ''} ${e.all?.[0]?.summary ?? ''}`.trim());
      return status(422, { message, field: (e.all?.[0]?.path ?? '').split('/').filter(Boolean).pop() ?? null });
    }
    // Error inesperado (un bug o una caída de la base): se reporta con un id y la persona recibe un mensaje claro, sin detalles internos.
    if (code === 'UNKNOWN' || code === 'INTERNAL_SERVER_ERROR') {
      const id = reportError(error, { source: 'server', method: request.method, path });
      return status(500, { message: `Ocurrió un error inesperado. Inténtalo de nuevo. (Ref. ${id})`, ref: id });
    }
    console.error(`[api] ${request.method} ${path} → ${code}: ${String((error as Error)?.message ?? error).slice(0, 300)}`);
  })
  .use(authPlugin)
  .use(healthModule)
  .use(clientErrorsModule)
  .use(meModule)
  .use(interestsModule)
  .use(connectModule)
  .use(notificationsModule)
  .use(waitlistModule)
  .use(stripeWebhookModule)
  .use(organizationsModule)
  .use(orgSpacesModule)
  .use(classesModule)
  .use(discoverModule)
  .use(studentsModule)
  .use(attendanceModule)
  .use(billingModule)
  .use(adminModule)
  .use(privatesModule)
  .use(paymentsModule)
  .use(uploadsModule)
  .use(teamModule)
  .use(accountsModule)
  .use(rolesModule)
  .use(zonesModule)
  .compile();

/** Tipo para el cliente Eden. En el cliente importa SIEMPRE con `import type`. */
export type App = typeof api;
