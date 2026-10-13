import { Elysia, t } from 'elysia';

import { allowLocal } from '../lib/rate-limit';
import { reportError } from '../lib/report';

/**
 * Errores que ocurren DENTRO de la app (pantalla en blanco, excepciones sin atrapar). Es público a propósito: la persona puede
 * estar fuera de sesión cuando falla. Por eso: cuerpo chico, límite de frecuencia por origen y nada de esto toca la base de datos.
 */
export const clientErrorsModule = new Elysia({ name: 'client-errors' }).post(
  '/client-errors',
  ({ body, request, set }) => {
    const ip = (request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? 'desconocido').split(',')[0].trim();
    if (!allowLocal(`client-error:${ip}`, 20, 60_000)) {
      set.status = 429;
      return { ok: false as const };
    }
    const err = new Error(body.message.slice(0, 300));
    err.name = 'ClientError';
    err.stack = body.stack ? `${err.name}: ${err.message}\n${body.stack.slice(0, 2000)}` : undefined;
    reportError(err, { source: 'client', tags: { platform: body.platform ?? '?', screen: (body.screen ?? '?').slice(0, 80), version: body.version ?? '?' } });
    // 200 con cuerpo (no 204): el runtime de Node de Expo rechaza una respuesta 204 con cuerpo vacío.
    return { ok: true as const };
  },
  {
    body: t.Object({
      message: t.String({ minLength: 1, maxLength: 2000 }),
      stack: t.Optional(t.String({ maxLength: 8000 })),
      screen: t.Optional(t.String({ maxLength: 200 })),
      platform: t.Optional(t.String({ maxLength: 20 })),
      version: t.Optional(t.String({ maxLength: 30 })),
    }),
  }
);
