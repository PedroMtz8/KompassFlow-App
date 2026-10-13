import * as Location from 'expo-location';
import { create } from 'zustand';

/** Ubicación del dispositivo, para "cerca de mí". Solo se pide cuando la persona lo solicita. */
type LocationState = {
  status: 'idle' | 'loading' | 'granted' | 'denied' | 'error';
  coords: { lat: number; lng: number } | null;
  request: () => Promise<void>;
};

export const useLocation = create<LocationState>((set) => ({
  status: 'idle',
  coords: null,
  request: async () => {
    set({ status: 'loading' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return set({ status: 'denied' });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ status: 'granted', coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
    } catch {
      set({ status: 'error' });
    }
  },
}));

/** Distancia en km entre dos puntos (fórmula de haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`);
