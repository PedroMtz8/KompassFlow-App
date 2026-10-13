import type { StateStorage } from 'zustand/middleware';

/**
 * Almacenamiento para web (localStorage). En el render de servidor (SSR) no existe
 * `window`, así que las operaciones son no-op y `persist` hidrata al montar el cliente.
 */
const local = () => (typeof window !== 'undefined' ? window.localStorage : undefined);

/** Adaptador para `persist` de Zustand. */
export const zustandStorage: StateStorage = {
  getItem: (name) => local()?.getItem(name) ?? null,
  setItem: (name, value) => local()?.setItem(name, value),
  removeItem: (name) => local()?.removeItem(name),
};
