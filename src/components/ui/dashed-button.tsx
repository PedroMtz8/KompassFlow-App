import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type DashedButtonProps = { label: string; icon?: LucideIcon; onPress?: () => void; className?: string };

/** Acción secundaria con borde punteado: "Agregar salón", "Crear academia o negocio". */
export function DashedButton({ label, icon, onPress, className }: DashedButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'h-12 flex-row items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#D2C6D5] active:opacity-70',
        className
      )}
    >
      {icon ? <Icon as={icon} size={17} color="#4A4152" /> : null}
      <Text className="text-sm font-bold text-[#4A4152]">{label}</Text>
    </Pressable>
  );
}
