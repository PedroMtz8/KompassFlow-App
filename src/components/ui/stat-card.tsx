import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Gradient } from '@/components/ui/gradient';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import type { Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

type Stat = { value: string; label: string };

type StatCardProps = {
  title: string;
  icon: LucideIcon;
  stats: Stat[];
  tone?: Tone;
  className?: string;
};

/** Tarjeta con degradado y números grandes: "HOY EN LA ACADEMIA". */
export function StatCard({ title, icon, stats, tone = 'orange', className }: StatCardProps) {
  return (
    <Gradient tone={tone} style={{ borderRadius: 26, padding: 15, gap: 12 }}>
      <View className={cn('flex-row items-center gap-2.5', className)}>
        <IconTile icon={icon} size={34} glass />
        <Text className="flex-1 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-white/90">{title}</Text>
      </View>
      <View className="flex-row gap-3">
        {stats.map((s) => (
          <View key={s.label} className="flex-1 gap-[3px]">
            <Text className="font-mono-bold text-[28px] leading-[28px] tracking-[-0.04em] text-white">{s.value}</Text>
            <Text className="text-[11.5px] font-semibold text-white/90">{s.label}</Text>
          </View>
        ))}
      </View>
    </Gradient>
  );
}
