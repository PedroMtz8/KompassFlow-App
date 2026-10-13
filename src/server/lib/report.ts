import { env } from '../env';

export type ErrorContext = {
  /** De dónde viene: servidor, app (cliente), correo… */
  source?: string;
  level?: 'error' | 'warning';
  method?: string;
  path?: string;
  userId?: string;
  tags?: Record<string, string>;
};

const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Para no inundar a Sentry (ni la cuota) con el mismo error repetido o con una tormenta de errores.
const g = globalThis as { __errSeen?: Map<string, number>; __errWindow?: { at: number; n: number } };
const seen = (g.__errSeen ??= new Map<string, number>());
const window = (g.__errWindow ??= { at: 0, n: 0 });
function throttled(key: string) {
  const now = Date.now();
  if (now - (seen.get(key) ?? 0) < 60_000) return true;
  seen.set(key, now);
  if (seen.size > 200) for (const [k, t] of seen) if (now - t > 60_000) seen.delete(k);
  if (now - window.at > 60_000) Object.assign(window, { at: now, n: 0 });
  return ++window.n > 30;
}

/** Líneas «at fn (archivo:línea:col)» → marcos para Sentry (del más viejo al más reciente, como los pide). */
function frames(stack: string | undefined) {
  const out: { function?: string; filename: string; lineno?: number; colno?: number }[] = [];
  for (const line of (stack ?? '').split('\n').slice(1, 30)) {
    const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (m) out.push({ function: m[1], filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) });
  }
  return out.reverse();
}

/**
 * Registra un error: siempre en el log (una línea JSON, fácil de buscar) y, si hay SENTRY_DSN, también en Sentry. Nunca lanza y
 * NUNCA envía cuerpos de petición, cabeceras, cookies ni correos: solo el mensaje, la traza, la ruta y el id de la persona.
 * Devuelve un id corto para que quien reporta el problema lo pueda citar.
 */
export function reportError(err: unknown, ctx: ErrorContext = {}): string {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Error desconocido');
  const eventId = hex();
  const level = ctx.level ?? 'error';
  try {
    console.error(
      JSON.stringify({ level, id: eventId.slice(0, 8), source: ctx.source ?? 'server', name: e.name, msg: e.message.slice(0, 300), method: ctx.method, path: ctx.path, user: ctx.userId, stack: e.stack?.split('\n').slice(1, 6).join(' | ') })
    );
    const sentry = env.sentry;
    if (!sentry || throttled(`${e.name}:${e.message}:${ctx.path ?? ''}`)) return eventId.slice(0, 8);
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'node',
      level,
      environment: env.environment,
      release: env.release,
      server_name: 'stagelight-api',
      tags: { source: ctx.source ?? 'server', ...ctx.tags },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      request: ctx.path ? { method: ctx.method, url: ctx.path } : undefined,
      exception: { values: [{ type: e.name, value: e.message.slice(0, 1000), stacktrace: { frames: frames(e.stack) } }] },
    };
    const body = [JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: sentry.dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
    void fetch(sentry.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_client=stagelight/1, sentry_key=${sentry.key}` },
      body,
    }).catch(() => {});
  } catch {
    /* reportar un error nunca debe causar otro */
  }
  return eventId.slice(0, 8);
}
