import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { useTheme, withAlpha } from '@/lib/theme';

/**
 * Fondo ambiental de las pantallas: un velo de color de marca que se desvanece hacia abajo.
 * Es decorativo (no recibe toques) y queda detrás de todo.
 */
export function Ambient() {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420, overflow: 'hidden' }}>
      <LinearGradient
        colors={[withAlpha(t.primary, 0.11), withAlpha(t.violet, 0.05), withAlpha(t.primary, 0)]}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420 }}
      />
    </View>
  );
}
