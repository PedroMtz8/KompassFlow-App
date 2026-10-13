import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

/**
 * Modo de la app: 'student' (descubrir y reservar) u 'org' (operar una organización).
 * La organización concreta es `session.activeOrganizationId` (vive en el servidor); este modo solo
 * recuerda en cuál de los dos lados estaba el usuario.
 */
type SpaceState = {
  mode: 'student' | 'org' | 'admin';
  setMode: (mode: 'student' | 'org' | 'admin') => void;
  /**
   * Último lado en que estuvo cada persona en este dispositivo: id de la organización, `'admin'` si estaba en la administración de la plataforma, o `null` si estaba como alumno.
   * La organización activa vive en la sesión del servidor y se pierde al cerrar sesión; esto permite volver a ella.
   */
  last: Record<string, string | null>;
  remember: (userId: string, space: string | null) => void;
};

export const useSpace = create<SpaceState>()(
  persist(
    (set) => ({
      mode: 'student',
      setMode: (mode) => set({ mode }),
      last: {},
      remember: (userId, space) => set((s) => ({ last: { ...s.last, [userId]: space } })),
    }),
    {
      name: 'space',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);

/** `true` cuando el modo guardado ya se leyó del almacenamiento (en web se hidrata al montar). */
export function useSpaceHydrated() {
  return useSyncExternalStore(
    (notify) => useSpace.persist.onFinishHydration(notify),
    () => useSpace.persist.hasHydrated(),
    () => false
  );
}
