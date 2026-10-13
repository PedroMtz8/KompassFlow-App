import { create } from 'zustand';

type ToastState = {
  id: number;
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
};

/** Aviso efímero de confirmación. En la fase mock lo dispara `done()` para simular que algo se guardó. */
export const useToast = create<ToastState>((set) => ({
  id: 0,
  message: null,
  show: (message) => set((s) => ({ id: s.id + 1, message })),
  hide: () => set({ message: null }),
}));
