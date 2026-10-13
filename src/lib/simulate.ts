import { useToast } from '@/stores/toast';

/**
 * Simula que una acción se completó: muestra el aviso y ejecuta la navegación siguiente.
 * No guarda nada. Al integrar la API, se reemplaza por la mutación real y `done` queda para el éxito.
 */
export function done(message: string, next?: () => void) {
  useToast.getState().show(message);
  next?.();
}
