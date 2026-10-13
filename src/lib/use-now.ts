import { useEffect, useState } from 'react';

/** Instante actual que se refresca cada `intervalMs`. Mantiene puro el render (nada de `Date.now()` directo). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
