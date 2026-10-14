import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { getBaseUrl } from '@/lib/base-url';

/**
 * Enlace que abre ESTA app en `path`: en web, la misma página; en celular, un deep link (en Expo Go, `exp://…`; en una
 * build, `kompassflow://…`). Se manda al servidor como destino de los enlaces de los correos (recuperar contraseña, confirmar correo).
 */
export function appLink(path: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return Linking.createURL(path);
}

/**
 * Como `appLink`, pero apto para Stripe: sus enlaces de regreso solo aceptan http(s), no `exp://` ni `kompassflow://`.
 * En celular se pasa por una página del servidor (`/api/stripe/return`) que devuelve a la persona a la app.
 */
export function stripeReturnLink(path: string, sessionPlaceholder = false) {
  const link = appLink(path);
  // `{CHECKOUT_SESSION_ID}` debe ir sin codificar: Stripe lo sustituye en la URL que recibe; la página de regreso lo reenvía a la app.
  if (/^https?:\/\//.test(link)) return sessionPlaceholder ? `${link}?session_id={CHECKOUT_SESSION_ID}` : link;
  return `${getBaseUrl()}/api/stripe/return?to=${encodeURIComponent(link)}${sessionPlaceholder ? '&session_id={CHECKOUT_SESSION_ID}' : ''}`;
}
