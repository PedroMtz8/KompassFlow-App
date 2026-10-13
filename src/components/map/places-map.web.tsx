import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import type { PlacesMapProps } from './types';

// Leaflet necesita `window`: se importa de forma diferida y solo después de montar en el navegador.
const LeafletMap = lazy(() => import('./leaflet-map'));

function ensureLeafletCss() {
  if (typeof document === 'undefined' || document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

export function PlacesMap(props: PlacesMapProps) {
  // false en el render de servidor, true en el navegador (sin desajuste de hidratación).
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  useEffect(() => {
    ensureLeafletCss();
  }, []);

  const height = props.height ?? 240;
  const placeholder = <View style={{ width: '100%', height, backgroundColor: '#F1E9DF' }} />;
  if (!isClient) return placeholder;
  return (
    <View style={{ width: '100%', height }}>
      <Suspense fallback={placeholder}>
        <LeafletMap {...props} />
      </Suspense>
    </View>
  );
}
