export const kindLabel = { GROUP: 'Grupal', PRIVATE: 'Privada', WORKSHOP: 'Taller' } as const;
export const levelLabel = { ALL: 'Todos los niveles', BEGINNER: 'Principiante', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado' } as const;
export type Kind = keyof typeof kindLabel;
export type Level = keyof typeof levelLabel;
