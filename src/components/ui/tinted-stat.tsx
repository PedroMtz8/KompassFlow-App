import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

type TintedStatProps = { icon: LucideIcon; value: string; label: string; tone: Tone; className?: string };

/** Mosaico tintado con icono, cifra grande y etiqueta ("3 salones", "56 lugares"). */
export function TintedStat({ icon, value, label, tone, className }: TintedStatProps) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <View className={cn('flex-1 gap-2 rounded-[22px] p-3.5', className)} style={{ backgroundColor: t.soft }}>
      <IconTile icon={icon} tone={tone} size={34} />
      <Text className="font-mono-bold text-2xl leading-6 tracking-[-0.03em]" style={{ color: t.ink }}>
        {value}
      </Text>
      <Text className="text-xs font-semibold" style={{ color: t.deep }}>
        {label}
      </Text>
    </View>
  );
}

/** Cifra pequeña tintada (asistencias, pagos, paquete). */
export function MiniStat({ value, label, tone }: { value: string; label: string; tone: Tone }) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <View className="flex-1 gap-0.5 rounded-[14px] px-2.5 py-[9px]" style={{ backgroundColor: t.soft }}>
      <Text className="font-mono-bold text-[17px] leading-[17px]" style={{ color: t.ink }}>
        {value}
      </Text>
      <Text className="text-[11px] font-semibold" style={{ color: t.deep }}>
        {label}
      </Text>
    </View>
  );
}
