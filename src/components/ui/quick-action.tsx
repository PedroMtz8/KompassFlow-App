import type { LucideIcon } from 'lucide-react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';
import { withAlpha } from '@/lib/theme';

type QuickActionProps = { label: string; icon: LucideIcon; tone: Tone; onPress?: () => void };

/** Acceso rápido tintado con mosaico: "Nuevo alumno", "Registrar pago". */
export function QuickAction({ label, icon, tone, onPress }: QuickActionProps) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <PressScale
      onPress={onPress}
      scale={0.94}
      className="flex-1 items-center gap-2 rounded-[22px] px-2 pb-3 pt-3.5"
      style={{ backgroundColor: t.soft, borderWidth: 1, borderColor: withAlpha(t.solid, 0.14) }}
    >
      <IconTile icon={icon} tone={tone} size={36} />
      <Text className="text-center text-[12px] font-extrabold" style={{ color: t.ink }}>
        {label}
      </Text>
    </PressScale>
  );
}
