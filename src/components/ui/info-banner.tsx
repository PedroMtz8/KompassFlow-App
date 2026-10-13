import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';

type InfoBannerProps = {
  icon: LucideIcon;
  tone: Tone;
  text: string;
  action?: string;
  onAction?: () => void;
  /** `medium` = texto en negrita de una sola línea (alertas); `note` = párrafo explicativo. */
  variant?: 'alert' | 'note';
};

/** Aviso tintado con mosaico: notas informativas y alertas ("3 transferencias por confirmar"). */
export function InfoBanner({ icon, tone, text, action, onAction, variant = 'note' }: InfoBannerProps) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <View className="flex-row items-center gap-[11px] rounded-[20px] px-3.5 py-3" style={{ backgroundColor: t.soft }}>
      <IconTile icon={icon} tone={tone} size={variant === 'alert' ? 32 : 34} />
      <Text
        className={variant === 'alert' ? 'flex-1 text-[13px] font-bold' : 'flex-1 text-[12.5px] font-semibold leading-[18px]'}
        style={{ color: t.ink }}
      >
        {text}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text className="text-[12.5px] font-extrabold" style={{ color: t.deep }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
