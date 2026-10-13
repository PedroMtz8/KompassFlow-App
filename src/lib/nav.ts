import { router } from 'expo-router';

/** Vuelve atrás; si no hay historial (enlace directo, recarga en web) va al inicio. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
