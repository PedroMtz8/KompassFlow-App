import { create } from 'zustand';

import type { CreateOrganizationInput } from '@/features/organizations/queries';

/** Borrador del alta de organización entre los 3 pasos. Vive en memoria: se descarta si se cierra la app. */
export type OrgDraft = {
  type: CreateOrganizationInput['type'];
  name: string;
  verticalId?: string;
  description: string;
  phone: string;
  instagram: string;
  website: string;
};

const empty: OrgDraft = { type: 'STUDIO', name: '', verticalId: undefined, description: '', phone: '', instagram: '', website: '' };

type DraftState = { draft: OrgDraft; patch: (p: Partial<OrgDraft>) => void; reset: () => void };

export const useOrgDraft = create<DraftState>((set) => ({
  draft: empty,
  patch: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),
  reset: () => set({ draft: empty }),
}));
