import Storage from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * Almacenamiento clave-valor síncrono (expo-sqlite/kv-store). Funciona en Expo Go.
 * La versión web está en `storage.web.ts` (localStorage).
 * Para secretos/tokens usa expo-secure-store (Better Auth ya lo hace en nativo).
 */

/** Adaptador para `persist` de Zustand. */
export const zustandStorage: StateStorage = {
  getItem: (name) => Storage.getItemSync(name),
  setItem: (name, value) => Storage.setItemSync(name, value),
  removeItem: (name) => Storage.removeItemSync(name),
};
