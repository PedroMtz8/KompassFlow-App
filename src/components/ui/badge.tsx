import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

type BadgeProps = {
  children: string;
  tone?: Tone;
  /** `white` = etiqueta blanca sobre foto; `solid` = tono sólido con texto blanco. */
  appearance?: 'soft' | 'white' | 'solid';
  className?: string;
};

/** Etiqueta en mayúsculas: INSTRUCTOR, STUDIO, PAGADO... */
export function Badge({ children, tone = 'orange', appearance = 'soft', className }: BadgeProps) {
  const tones = useTones();
  const t = tones[tone];
  const bg = appearance === 'white' ? '#FFFFFF' : appearance === 'solid' ? t.solid : t.soft;
  const color = appearance === 'white' ? '#1B1620' : appearance === 'solid' ? '#FFFFFF' : t.deep;
  return (
    <View className={cn('self-start rounded-full px-2.5 py-[3px]', className)} style={{ backgroundColor: bg }}>
      <Text className="text-[10px] font-extrabold uppercase tracking-[0.05em]" style={{ color }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}
