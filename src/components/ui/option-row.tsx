import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type OptionRowProps = {
  title: string;
  note: string;
  selected: boolean;
  leading: React.ReactNode;
  onPress: () => void;
};

/** Opción seleccionable (método de pago): borde naranja + palomita cuando está activa. */
export function OptionRow({ title, note, selected, leading, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      role="radio"
      aria-checked={selected}
      className={cn(
        'flex-row items-center gap-3 rounded-[20px] border-2 bg-card px-[11px] py-2.5 active:opacity-90',
        selected ? 'border-primary' : 'border-transparent'
      )}
    >
      {leading}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold">{title}</Text>
        <Text className="text-[11.5px] text-muted-foreground">{note}</Text>
      </View>
      {selected ? (
        <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={13} color="#fff" strokeWidth={3} />
        </View>
      ) : (
        <View className="h-[22px] w-[22px] rounded-full border-2 border-[#D8D0DB]" />
      )}
    </Pressable>
  );
}
