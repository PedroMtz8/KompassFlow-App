import { Redirect } from 'expo-router';

import { Entry } from '@/features/entry/entry';

/** Entrada: sin sesión => iniciar sesión; con sesión => el lado donde estaba esa persona. (En la web, `index.web.tsx` muestra la página de presentación.) */
export default function Index() {
  return <Entry signedOut={<Redirect href="/sign-in" />} />;
}
