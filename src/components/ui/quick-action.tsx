import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTones, type Tone } from '@/lib/tones';

type QuickActionProps = { label: string; icon: LucideIcon; tone: Tone; onPress?: () => void };

/** Acceso rápido tintado con mosaico: "Nuevo alumno", "Registrar pago". */
export function QuickAction({ label, icon, tone, onPress }: QuickActionProps) {
  const tones = useTones();
  const t = tones[tone];
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center gap-[7px] rounded-[20px] px-2 py-[11px] active:opacity-80"
      style={{ backgroundColor: t.soft }}
    >
      <IconTile icon={icon} tone={tone} size={32} />
      <Text className="text-center text-[11.5px] font-bold" style={{ color: t.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
