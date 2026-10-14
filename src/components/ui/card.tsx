import { View } from 'react-native';

import { Text, type TextProps } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ViewProps = React.ComponentProps<typeof View>;

/** Superficie blanca con sombra suave: la tarjeta base de KompassFlow. */
export function Card({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-[22px] bg-card p-4 shadow-[0_6px_20px_rgba(27,22,32,0.06)]', className)} {...props} />;
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
