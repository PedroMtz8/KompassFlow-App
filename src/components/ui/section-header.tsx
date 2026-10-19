import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  title: string;
  action?: string;
  onAction?: () => void;
  /** `overline` = mayúsculas grises ("SESIONES"); `title` = título en negrita ("Hoy cerca de ti"). */
  variant?: 'overline' | 'title';
  className?: string;
};

export function SectionHeader({ title, action, onAction, variant = 'overline', className }: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-baseline justify-between', className)}>
      {variant === 'overline' ? <Text variant="overline">{title}</Text> : <Text className="text-base font-extrabold">{title}</Text>}
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text className="text-[12.5px] font-extrabold text-primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
