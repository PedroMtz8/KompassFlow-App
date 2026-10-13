import { env } from '../env';

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };

/**
 * Envía push por el servicio de Expo (lotes de hasta 100). Devuelve los tokens que Expo dice que ya no
 * existen (`DeviceNotRegistered`) para que quien llama los borre. Mejor esfuerzo: nunca lanza.
 */
export async function sendPush(messages: PushMessage[]): Promise<{ dead: string[] }> {
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const r = await fetch(env.expoPushUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default', priority: 'high', channelId: 'default' }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) continue;
      const json = (await r.json()) as { data?: { status: string; details?: { error?: string } }[] };
      json.data?.forEach((t, idx) => {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') dead.push(batch[idx].to);
      });
    } catch {
      /* sin red o Expo caído: el aviso dentro de la app ya quedó guardado */
    }
  }
  return { dead };
}
