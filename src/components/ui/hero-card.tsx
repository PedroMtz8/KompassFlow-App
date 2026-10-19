import { LinearGradient } from 'expo-linear-gradient';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTones, type Tone } from '@/lib/tones';
import { withAlpha } from '@/lib/theme';

type HeroCardProps = {
  tone: Tone;
  radius?: number;
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Tarjeta destacada: degradado del tono, dos círculos translúcidos que le dan profundidad y un resplandor de su color debajo.
 * Es la «portada» de pantallas como Mis clases y Hoy.
 */
export function HeroCard({ tone, radius = 28, padding = 18, gap = 12, style, children }: HeroCardProps) {
  const spec = useTones()[tone];
  return (
    <View style={[{ borderRadius: radius, boxShadow: `0 22px 38px -16px ${withAlpha(spec.solid, 0.6)}` } as ViewStyle, style]}>
      <LinearGradient
        colors={spec.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius, overflow: 'hidden', padding, gap }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: -56, top: -70, width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.13)' }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 46, bottom: -96, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.08)' }}
        />
        {children}
      </LinearGradient>
    </View>
  );
}
