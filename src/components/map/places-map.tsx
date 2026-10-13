import { NativeMap } from './native-map';
import type { PlacesMapProps } from './types';

/** iOS: Apple Maps. Android tiene su propia versión (`places-map.android.tsx`) y la web la suya (`places-map.web.tsx`). */
export function PlacesMap(props: PlacesMapProps) {
  return <NativeMap {...props} />;
}
