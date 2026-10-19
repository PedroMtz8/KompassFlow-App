import { PressScale } from '@/components/ui/press-scale';
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
    <PressScale
      onPress={onPress}
      disabled={disabled}
      scale={0.94}
      className={cn(
        'rounded-full px-3.5 py-[9px]',
        selected ? 'bg-ink shadow-[0_8px_18px_-6px_rgba(16,32,26,0.5)]' : onCard ? 'bg-muted' : 'border border-ink/[0.05] bg-card',
        disabled && 'opacity-40'
      )}
    >
      <Text className={cn('text-[13px] font-bold', selected ? 'text-white' : 'text-muted-foreground')}>{label}</Text>
    </PressScale>
  );
}
