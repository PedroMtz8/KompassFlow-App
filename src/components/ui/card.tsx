import { View } from 'react-native';

import { Text, type TextProps } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ViewProps = React.ComponentProps<typeof View>;

/** Sombra en dos capas: un filo corto que da borde y una difusa que la despega del fondo. */
export const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]';

/** Superficie blanca con sombra suave: la tarjeta base de Kompass. */
export function Card({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-[24px] border border-ink/[0.045] bg-card p-4', CARD_SHADOW, className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return <Text variant="h4" className={cn('text-card-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: TextProps) {
  return <Text variant="muted" className={className} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('gap-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('flex-row items-center gap-2', className)} {...props} />;
}
