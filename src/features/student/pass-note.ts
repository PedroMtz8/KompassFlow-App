type PassInfo = { name: string; remaining: number | null; reserved: number } | null | undefined;

/** Qué le pasará al paquete de la persona si reserva esta clase (los créditos se descuentan al asistir, no al reservar). */
export function passNote(pass: PassInfo): { covered: boolean; text: string } | null {
  if (!pass) return null;
  if (pass.remaining == null) return { covered: true, text: `Incluida en tu ${pass.name} (ilimitado).` };
  const free = pass.remaining - pass.reserved;
  const left = `${pass.remaining} ${pass.remaining === 1 ? 'crédito' : 'créditos'}`;
  if (free > 0)
    return { covered: true, text: `Usará 1 crédito de tu ${pass.name} al asistir. Hoy tienes ${left}${pass.reserved ? `, ${pass.reserved} ya apartados` : ''}.` };
  return {
    covered: false,
    text: `Tus ${left} de ${pass.name} ya están apartados en otras reservas. Esta clase se paga en el lugar o con un paquete nuevo.`,
  };
}
