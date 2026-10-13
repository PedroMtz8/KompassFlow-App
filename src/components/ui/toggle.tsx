import { Pressable, View } from 'react-native';

import { cn } from '@/lib/utils';

type ToggleProps = { value: boolean; onValueChange?: (value: boolean) => void };

/** Interruptor de 46×28 con el naranja de marca. */
export function Toggle({ value, onValueChange }: ToggleProps) {
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      onPress={() => onValueChange?.(!value)}
      className={cn('h-7 w-[46px] justify-center rounded-full px-[3px]', value ? 'bg-primary' : 'bg-[#D8D0DB]')}
    >
      <View className={cn('h-[22px] w-[22px] rounded-full bg-white', value ? 'self-end' : 'self-start')} />
    </Pressable>
  );
}
