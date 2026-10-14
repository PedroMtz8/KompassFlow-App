import type { ReactElement } from 'react';

import { env } from '../env';
import { reportError } from './report';

/**
 * `react` puede ser una función: así las plantillas (y React Email, que es lo más pesado del servidor) se cargan solo al enviar
 * un correo y no al arrancar. El hosting en la nube corta los arranques que gastan demasiada CPU.
 */
type Message = { to: string; subject: string; react: ReactElement | (() => Promise<ReactElement>) };

/** Dominios reservados (RFC 2606): nunca son reales, así que jamás se les manda correo de verdad (pruebas, datos de ejemplo). */
const RESERVED = /@(example\.(com|org|net)|[^@]*\.(test|example|invalid|localhost))$/i;

/**
 * Envía un correo transaccional con Resend (plantillas de React Email). NUNCA lanza: un correo que falla no debe tumbar
 * el registro, la invitación ni la cancelación; el error queda en el log. Sin `RESEND_API_KEY` no se envía: en desarrollo se
 * imprime el texto (con los enlaces) para poder probar los flujos; en producción solo se avisa que falta configurar.
 */
export async function sendEmail({ to, subject, react }: Message): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const { render } = await import('@react-email/render');
    const element = typeof react === 'function' ? await react() : react;
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    const cfg = env.resend;
    // Con el Resend real, un correo a un dominio reservado no se envía (rebotaría y mancharía la reputación del remitente).
    if (cfg && cfg.baseUrl === 'https://api.resend.com' && RESERVED.test(to)) return { ok: true, skipped: true };
    if (!cfg) {
      if (env.isProduction) console.error(`[email] sin RESEND_API_KEY: no se envió «${subject}»`);
      else console.log(`[email] (desarrollo, sin RESEND_API_KEY) → ${to}\n  asunto: ${subject}\n${text}\n`);
      return { ok: true, skipped: true };
    }
    const res = await fetch(`${cfg.baseUrl}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      reportError(new Error(`Resend respondió ${res.status} al enviar «${subject}»: ${(await res.text()).slice(0, 200)}`), { source: 'email', level: 'warning' });
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    reportError(new Error(`Error al enviar «${subject}»: ${(e as Error).message}`), { source: 'email', level: 'warning' });
    return { ok: false };
  }
}
