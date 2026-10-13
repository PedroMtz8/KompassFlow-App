import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Icon } from '@/components/ui/icon';
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
      ? 'flex-row items-center gap-3 rounded-[20px] bg-card px-3 py-[11px] shadow-[0_6px_20px_rgba(27,22,32,0.06)]'
      : 'flex-row items-center gap-[11px] py-[9px]';
  return onPress ? (
    <Pressable onPress={onPress} className={`${cls} active:opacity-80`}>
      {body}
    </Pressable>
  ) : (
    <View className={cls}>{body}</View>
  );
}
