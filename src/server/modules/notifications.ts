import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { runWaitlistMaintenance } from '../db/waitlist';
import { getPrefs, listNotifications, markRead, registerPushToken, removePushToken, runReminders, savePrefs, unreadCount } from '../db/notifications';
import { env } from '../env';
import { allow } from '../lib/rate-limit';

/** Compara en tiempo constante (el secreto del planificador no se debe poder adivinar midiendo tiempos). */
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Avisos dentro de la app, preferencias, dispositivos para push y los trabajos programados. */
export const notificationsModule = new Elysia({ name: 'notifications' })
  .use(authPlugin)
  .get(
    '/me/notifications',
    async ({ user, query }) => ({
      unread: await unreadCount(user.id),
      items: await listNotifications(user.id, { limit: query.limit ?? 30, offset: query.offset ?? 0 }),
    }),
    {
      auth: true,
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })), offset: t.Optional(t.Numeric({ minimum: 0, maximum: 100_000 })) }),
    }
  )
  .get('/me/notifications/unread', async ({ user }) => ({ unread: await unreadCount(user.id) }), { auth: true })
  .post(
    '/me/notifications/read',
    async ({ user, body }) => {
      await markRead(user.id, body.ids);
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ ids: t.Optional(t.Array(t.String({ maxLength: 64 }), { maxItems: 100 })) }) }
  )
  .get('/me/notification-prefs', ({ user }) => getPrefs(user.id), { auth: true })
  .put(
    '/me/notification-prefs',
    async ({ user, body }) => {
      await savePrefs(user.id, body);
      return getPrefs(user.id);
    },
    { auth: true, body: t.Object({ reminders: t.Boolean(), classChanges: t.Boolean(), payments: t.Boolean(), team: t.Boolean() }) }
  )
  .post(
    '/me/push-token',
    async ({ user, body, status }) => {
      if (!(await allow(`push-token:${user.id}`, 20, 10 * 60_000))) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      await registerPushToken(user.id, body.token, body.platform);
      return { ok: true as const };
    },
    {
      auth: true,
      body: t.Object({
        // Formato de los tokens de Expo: ExponentPushToken[xxxx] (o ExpoPushToken[xxxx]).
        token: t.String({ minLength: 20, maxLength: 200, pattern: '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]+\\]$' }),
        platform: t.Union([t.Literal('ios'), t.Literal('android'), t.Literal('web')]),
      }),
    }
  )
  .delete(
    '/me/push-token',
    async ({ user, body }) => {
      await removePushToken(user.id, body.token);
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ token: t.String({ maxLength: 200 }) }) }
  )

  /* ── Trabajos programados (los llama el planificador, no las personas) ── */
  .post('/jobs/reminders', async ({ request, status }) => {
    const secret = env.cronSecret;
    if (!secret) return status(503, { message: 'Los trabajos programados no están configurados.' });
    const given = request.headers.get('x-cron-secret') ?? '';
    if (!same(given, secret)) return status(401, { message: 'No autorizado.' });
    return { ok: true as const, ...(await runReminders()), waitlistOffers: (await runWaitlistMaintenance()).offered };
  });
