import { Text, type TextProps } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: TextProps) {
  return <Text className={cn('text-xs font-bold text-muted-foreground', className)} {...props} />;
}
