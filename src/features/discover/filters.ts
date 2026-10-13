import { create } from 'zustand';

import type { Level } from '@/features/classes/class-labels';

/**
 * Filtros de Descubrir (los aplica el servidor al consultar; ver `useDiscoverSessions`). Se combinan: entre grupos es "Y" (hoy Y bachata Y principiante) y dentro de un
 * grupo es "O" (bachata O salsa). Sin nada seleccionado, se muestra todo.
 */
export type When = 'today' | 'tomorrow' | 'weekend';
export type Sort = 'time' | 'near';

export const whenLabel: Record<When, string> = { today: 'Hoy', tomorrow: 'Mañana', weekend: 'Fin de semana' };

type FiltersState = {
  when: When[];
  disciplineIds: string[];
  levels: Level[];
  onlyAvailable: boolean;
  sort: Sort;
  toggleWhen: (w: When) => void;
  toggleDiscipline: (id: string) => void;
  toggleLevel: (l: Level) => void;
  setDisciplines: (ids: string[]) => void;
  setOnlyAvailable: (v: boolean) => void;
  setSort: (s: Sort) => void;
  clear: () => void;
};

const toggle = <T>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export const useDiscoverFilters = create<FiltersState>((set) => ({
  when: [],
  disciplineIds: [],
  levels: [],
  onlyAvailable: false,
  sort: 'time',
  toggleWhen: (w) => set((s) => ({ when: toggle(s.when, w) })),
  toggleDiscipline: (id) => set((s) => ({ disciplineIds: toggle(s.disciplineIds, id) })),
  toggleLevel: (l) => set((s) => ({ levels: toggle(s.levels, l) })),
  setDisciplines: (ids) => set({ disciplineIds: ids }),
  setOnlyAvailable: (v) => set({ onlyAvailable: v }),
  setSort: (sort) => set({ sort }),
  clear: () => set({ when: [], disciplineIds: [], levels: [], onlyAvailable: false }),
}));

export type FilterValues = Pick<FiltersState, 'when' | 'disciplineIds' | 'levels' | 'onlyAvailable'>;

/** Cuántos filtros hay activos (el orden no cuenta). */
export const activeFilterCount = (f: FilterValues) => f.when.length + f.disciplineIds.length + f.levels.length + (f.onlyAvailable ? 1 : 0);
