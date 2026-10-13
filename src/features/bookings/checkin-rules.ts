import type { MyBooking } from '@/features/bookings/queries';

const DAY = 24 * 3600_000;

/** Días después de la clase en que el alumno puede decir «sí asistí» (igual que en el servidor). */
export const CLAIM_WINDOW_DAYS = 7;

const active = (b: MyBooking) => b.status === 'CONFIRMED' && b.sessionStatus === 'SCHEDULED';

/** El alumno puede avisar que llegó: dentro de la ventana de la clase, sin asistencia marcada y sin aviso previo. */
export const canCheckIn = (b: MyBooking, now: number) =>
  active(b) && !b.attendance && now >= +new Date(b.checkInOpensAt) && now <= +new Date(b.endsAt);

/** «Sí asistí» sobre una clase ya terminada que la academia no registró (o dejó como falta), hasta 7 días después. */
export const canClaim = (b: MyBooking, now: number) =>
  active(b) &&
  b.attendance !== 'PRESENT' &&
  !b.checkedInAt &&
  now > +new Date(b.endsAt) &&
  now <= +new Date(b.endsAt) + CLAIM_WINDOW_DAYS * DAY;

export const inProgress = (b: MyBooking, now: number) =>
  active(b) && +new Date(b.startsAt) <= now && now <= +new Date(b.endsAt);
