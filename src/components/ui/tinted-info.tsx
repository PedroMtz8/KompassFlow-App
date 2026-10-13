import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';

type TintedInfoProps = { icon: LucideIcon; tone: Tone; title: string; note: string };

/** Mosaico de dato (fecha, salón, duración) con icono, título y nota. */
export function TintedInfo({ icon, tone, title, note }: TintedInfoProps) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <View className="flex-1 gap-2 rounded-[20px] p-[11px]" style={{ backgroundColor: t.soft }}>
      <IconTile icon={icon} tone={tone} size={30} />
      <View className="gap-0.5">
        <Text className="text-[13.5px] font-extrabold" style={{ color: t.ink }} numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-[11.5px] font-semibold" style={{ color: t.deep }} numberOfLines={1}>
          {note}
        </Text>
      </View>
    </View>
  );
}
