import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type Option<T extends string> = { value: T; label: string };

/** Selector de pestañas en forma de píldora (Clases | Academias | Mapa). */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) {
  return (
    <View className="flex-row rounded-2xl bg-muted p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={cn('flex-1 items-center rounded-xl py-2', on && 'bg-card shadow-[0_2px_8px_rgba(27,22,32,0.08)]')}
          >
            <Text className={cn('text-[13px] font-bold', on ? 'text-foreground' : 'text-muted-foreground')}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
