import { View } from 'react-native';

import { Gradient } from '@/components/ui/gradient';
import type { Tone } from '@/lib/tones';

type ProgressBarProps = {
  /** 0–1 */
  value: number;
  tone?: Tone;
  height?: number;
};

/** Barra de ocupación/cupo con degradado. */
export function ProgressBar({ value, tone = 'orange', height = 6 }: ProgressBarProps) {
  // Un valor no numérico (null, NaN) llegaría a iOS como «NaN%» y CoreGraphics lo reporta como error: se trata como 0.
  const pct = `${Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100}%` as `${number}%`;
  return (
    <View className="overflow-hidden rounded-full bg-ink/[0.07]" style={{ height }}>
      <Gradient tone={tone} direction="horizontal" style={{ height: '100%', width: pct, borderRadius: 99 }} />
    </View>
  );
}
