/** Vocabulario del rubro: cómo se llama un espacio, quien imparte y lo que ocurre ("Salón / Instructor / Clase"). */
export type Terms = { room: string; rooms: string; instructor: string; instructors: string; session: string };

const defaultTerms: Terms = {
  room: 'Espacio',
  rooms: 'Espacios',
  instructor: 'Instructor',
  instructors: 'Instructores',
  session: 'Sesión',
};

export function parseTerms(raw: string | null | undefined): Terms {
  try {
    return { ...defaultTerms, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return defaultTerms;
  }
}
