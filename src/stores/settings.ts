import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsState = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

/** Preferencias locales persistidas (kv-store en nativo, localStorage en web). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'settings', storage: createJSONStorage(() => zustandStorage) }
  )
);
