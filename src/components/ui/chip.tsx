import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Se ve atenuado y no responde (p. ej. un permiso que quien edita no tiene). */
  disabled?: boolean;
  /** Para usarlo dentro de una tarjeta blanca: el fondo sin seleccionar se atenúa para distinguirse. */
  onCard?: boolean;
};

/** Filtro en forma de píldora (Cerca de mí, Hoy, Bachata...). */
export function Chip({ label, selected, onPress, disabled, onCard }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn('rounded-full px-3.5 py-[9px] active:opacity-80', selected ? 'bg-ink' : onCard ? 'bg-muted' : 'bg-card', disabled && 'opacity-40')}
    >
      <Text className={cn('text-[13px] font-bold', selected ? 'text-white' : 'text-muted-foreground')}>{label}</Text>
    </Pressable>
  );
}
