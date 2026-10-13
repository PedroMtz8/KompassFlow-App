import { LinearGradient } from 'expo-linear-gradient';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTones, type Tone } from '@/lib/tones';

type GradientProps = {
  tone: Tone;
  /** `diagonal` (145°, tarjetas y mosaicos), `horizontal` (barras) o `vertical` (marca lateral). */
  direction?: 'diagonal' | 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const directions = {
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  horizontal: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  vertical: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
} as const;

/** Degradado con el tono de marca elegido. */
export function Gradient({ tone, direction = 'diagonal', style, children }: GradientProps) {
  const tones = useTones();
  return (
    <LinearGradient colors={tones[tone].gradient} {...directions[direction]} style={style}>
      {children}
    </LinearGradient>
  );
}
