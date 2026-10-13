import { Linking, Platform } from 'react-native';

/** Abre una URL externa (Stripe: Checkout, portal, alta de cobros): en web navega la pestaña; en celular abre el navegador. */
export async function openExternal(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(url);
  else await Linking.openURL(url);
}
