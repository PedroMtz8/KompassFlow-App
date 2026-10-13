/** Nombres legibles de los campos que más se rechazan (el resto se muestra como «ese dato»). */
const FIELDS: Record<string, string> = {
  name: 'el nombre',
  email: 'el correo',
  phone: 'el teléfono',
  password: 'la contraseña',
  newPassword: 'la nueva contraseña',
  currentPassword: 'la contraseña actual',
  description: 'la descripción',
  address: 'la dirección',
  city: 'la ciudad',
  neighborhood: 'la colonia',
  roomName: 'el nombre del salón',
  roomCapacity: 'la capacidad',
  capacity: 'la capacidad',
  priceCents: 'el precio',
  amountCents: 'el monto',
  credits: 'los créditos',
  validityDays: 'la vigencia',
  seats: 'las personas del paquete',
  durationMin: 'la duración',
  startTime: 'la hora de inicio',
  endTime: 'la hora de fin',
  startDate: 'la fecha de inicio',
  endDate: 'la fecha de fin',
  weekdays: 'los días',
  role: 'el rol',
  kind: 'el tipo',
  type: 'el tipo',
  method: 'el método de pago',
  reference: 'la referencia',
  concept: 'el concepto',
  note: 'la nota',
  timezone: 'la zona horaria',
  mapsUrl: 'el enlace de Google Maps',
  website: 'el sitio web',
  instagram: 'el Instagram',
  status: 'el estado',
};

type Issue = { path?: string; message?: string; summary?: string };

/**
 * Convierte el error de validación de Elysia (en inglés, con el esquema y los valores enviados) en un mensaje corto en
 * español que se puede mostrar a la persona. Nunca incluye los valores recibidos.
 */
export function validationMessage(error: { all?: Issue[]; message?: string }): string {
  const first = error.all?.[0];
  const key = (first?.path ?? '').split('/').filter(Boolean).pop() ?? '';
  const field = FIELDS[key] ?? 'ese dato';
  const text = `${first?.message ?? ''} ${first?.summary ?? ''}`.toLowerCase();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (text.includes('required property') || text.includes('is missing')) return `Falta ${field}.`;
  if (text.includes("'email' format") || text.includes('format email')) return 'El correo no es válido.';
  if (text.includes('format')) return `${cap(field)} no tiene un formato válido.`;
  if (text.includes('length greater') || text.includes('minlength') || text.includes('minimum length')) return `${cap(field)} es demasiado corto.`;
  if (text.includes('length less') || text.includes('maxlength') || text.includes('maximum length')) return `${cap(field)} es demasiado largo.`;
  if (text.includes('greater or equal') || text.includes('less or equal') || text.includes('minimum') || text.includes('maximum'))
    return `${cap(field)} está fuera del rango permitido.`;
  if (text.includes('pattern')) return `${cap(field)} no tiene un formato válido.`;
  return `Revisa ${field}.`;
}
