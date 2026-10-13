import { useTheme } from '@/lib/theme';

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
};

export type PlacesMapProps = {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Posición del usuario (punto azul). */
  user?: { lat: number; lng: number } | null;
  height?: number | `${number}%`;
  /** false = mapa estático (vista previa dentro de una tarjeta). */
  interactive?: boolean;
};

/** Centro de Tepic: vista inicial cuando aún no hay pines. */
export const TEPIC_CENTER = { lat: 21.5042, lng: -104.8946 };

/** Colores de los pines según el tema: secundario para los normales, primario para el seleccionado. */
export function usePinColors() {
  const t = useTheme();
  return { pin: t.violet, selected: t.primary };
}
