import { create } from 'zustand';

export type IssuedCredentials = {
  name: string;
  email: string;
  password: string;
  expiresAt: string | Date;
  organizationName?: string;
  /** true = contraseña regenerada (la cuenta ya existía). */
  reset?: boolean;
};

type State = { creds: IssuedCredentials | null; show: (c: IssuedCredentials) => void; clear: () => void };

/**
 * Credenciales recién emitidas, SOLO en memoria: se muestran una vez y no viajan por la URL ni se guardan en disco.
 */
export const useCredentials = create<State>((set) => ({
  creds: null,
  show: (creds) => set({ creds }),
  clear: () => set({ creds: null }),
}));
