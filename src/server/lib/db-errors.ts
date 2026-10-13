/**
 * ¿El error es una violación de restricción UNIQUE? Drizzle envuelve el error del motor en `DrizzleQueryError`
 * (el texto "UNIQUE constraint failed" queda en `cause`), así que hay que revisar toda la cadena.
 */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { message?: string; code?: string; cause?: unknown };
    if (/UNIQUE constraint failed/i.test(String(err.message ?? '')) || err.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
    cur = err.cause;
  }
  return false;
}
