import { useEffect, useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Platform, View } from 'react-native';

import { TEPIC_CENTER, usePinColors, type PlacesMapProps } from './types';

/**
 * Mapa nativo (iOS: Apple Maps, Android: Google Maps) con pines y la posición del usuario. Lo usan `places-map.tsx` (iOS) y
 * `places-map.android.tsx` (que avisa con `onLoaded` cuando terminó de pintar, para poder usar un respaldo si no lo hace).
 */
export function NativeMap({
  pins,
  selectedId,
  onSelect,
  user,
  height = 240,
  interactive = true,
  onLoaded,
}: PlacesMapProps & { onLoaded?: () => void }) {
  const ref = useRef<MapView>(null);
  const colors = usePinColors();
  const key = pins.map((p) => `${p.id}:${p.lat}:${p.lng}`).join('|');

  // Encuadra todos los pines cuando cambian (p. ej. al aplicar filtros).
  useEffect(() => {
    if (!pins.length) return;
    const t = setTimeout(() => {
      if (pins.length === 1) {
        ref.current?.animateToRegion({ latitude: pins[0].lat, longitude: pins[0].lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 300);
      } else {
        ref.current?.fitToCoordinates(
          pins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding: { top: 70, right: 60, bottom: 70, left: 60 }, animated: true }
        );
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View style={{ width: '100%', height }}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        // En Android se pide Google explícitamente (también funciona en Expo Go sin configurar nada).
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        onMapLoaded={onLoaded}
        initialRegion={{ latitude: TEPIC_CENTER.lat, longitude: TEPIC_CENTER.lng, latitudeDelta: 0.09, longitudeDelta: 0.09 }}
        showsUserLocation={!!user}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.title}
            description={p.subtitle}
            pinColor={p.id === selectedId ? colors.selected : colors.pin}
            onPress={() => onSelect?.(p.id)}
          />
        ))}
      </MapView>
    </View>
  );
}
