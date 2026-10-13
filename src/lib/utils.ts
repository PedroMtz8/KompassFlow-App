import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases condicionales y resuelve conflictos de Tailwind (`cn('p-2', cond && 'p-4')`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
