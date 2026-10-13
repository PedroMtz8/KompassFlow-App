import { useEffect, useState } from 'react';

/** Valor que se actualiza `ms` después del último cambio (evita una consulta por cada tecla). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
