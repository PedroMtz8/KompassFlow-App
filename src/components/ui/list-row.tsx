import ChevronRight from 'lucide-react-native/icons/chevron-right';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import { CARD_SHADOW } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';

type ListRowProps = {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  note?: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  /** `tile` = mosaico degradado 40px en tarjeta blanca; `soft` = mosaico suave 34px sin tarjeta (historial). */
  variant?: 'tile' | 'soft';
  chevron?: boolean;
  onPress?: () => void;
};

/** Fila con icono + título/nota + acción o importe a la derecha. */
export function ListRow({ icon, tone, title, note, badge, trailing, variant = 'tile', chevron, onPress }: ListRowProps) {
  const tones = useTones();
  const t = tones[tone];
  const body = (
    <>
      {variant === 'tile' ? (
        <IconTile icon={icon} tone={tone} size={40} />
      ) : (
        <View className="h-[34px] w-[34px] items-center justify-center rounded-[11px]" style={{ backgroundColor: t.soft }}>
          <Icon as={icon} size={17} color={t.deep} />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className={variant === 'tile' ? 'text-sm font-bold' : 'text-[13.5px] font-bold'} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        {note ? <Text className="text-[11.5px] text-muted-foreground">{note}</Text> : null}
      </View>
      {trailing}
      {chevron ? <Icon as={ChevronRight} size={18} color="#9A93A0" /> : null}
    </>
  );
  const cls =
    variant === 'tile'
      ? `flex-row items-center gap-3 rounded-[22px] border border-ink/[0.045] bg-card px-3 py-[11px] ${CARD_SHADOW}`
      : 'flex-row items-center gap-[11px] py-[9px]';
  return onPress ? (
    <PressScale onPress={onPress} scale={0.98} className={cls}>
      {body}
    </PressScale>
  ) : (
    <View className={cls}>{body}</View>
  );
}
