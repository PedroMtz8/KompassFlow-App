import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { HeroCard } from '@/components/ui/hero-card';
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

/** Tarjeta destacada con degradado y cifras grandes: "HOY EN TU ESPACIO". */
export function StatCard({ title, icon, stats, tone = 'orange', className }: StatCardProps) {
  return (
    <HeroCard tone={tone} radius={28} padding={18} gap={16}>
      <View className={cn('flex-row items-center gap-2.5', className)}>
        <IconTile icon={icon} size={34} glass />
        <Text className="flex-1 font-mono text-[11px] uppercase tracking-[0.08em] text-white/90">{title}</Text>
      </View>
      <View className="flex-row gap-3">
        {stats.map((s, i) => (
          <View key={s.label} className={cn('flex-1 gap-1', i > 0 && 'border-l border-white/20 pl-3')}>
            <Text className="font-mono-bold text-[34px] leading-[34px] tracking-[-0.05em] text-white">{s.value}</Text>
            <Text className="text-[12px] font-semibold text-white/85">{s.label}</Text>
          </View>
        ))}
      </View>
    </HeroCard>
  );
}
