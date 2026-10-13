import { useWindowDimensions } from 'react-native';

/** A partir de este ancho (px) la app cambia a disposición de escritorio: barra lateral en vez de pestañas. */
export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop() {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}
