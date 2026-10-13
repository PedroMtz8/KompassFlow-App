import { create } from 'zustand';

export type CropRequest = {
  uri: string;
  /** Tamaño real de la imagen original, en píxeles. */
  width: number;
  height: number;
  /** Relación ancho/alto del recorte (16/9 para portada, 1 para foto de perfil). */
  aspect: number;
  /** Ancho final de la imagen guardada. */
  outputWidth: number;
  title: string;
};

export type CropResult = { uri: string; name: string; type: string };

type CropperState = {
  request: (CropRequest & { resolve: (r: CropResult | null) => void }) | null;
  /** Abre el recortador y espera el resultado (`null` si la persona cancela). */
  crop: (req: CropRequest) => Promise<CropResult | null>;
  finish: (r: CropResult | null) => void;
};

export const useCropper = create<CropperState>((set, get) => ({
  request: null,
  crop: (req) =>
    new Promise((resolve) => {
      // Si ya había uno abierto se cancela, para que no quede una promesa colgada.
      get().request?.resolve(null);
      set({ request: { ...req, resolve } });
    }),
  finish: (r) => {
    get().request?.resolve(r);
    set({ request: null });
  },
}));
