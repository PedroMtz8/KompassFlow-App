import { CircleCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToast } from '@/stores/toast';

/** Monta el toast global; va una sola vez en el layout raíz. */
export function ToastHost() {
  const { id, message, hide } = useToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2600);
    return () => clearTimeout(t);
  }, [id, message, hide]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 top-0 items-center px-5"
      style={{ paddingTop: insets.top + (Platform.OS === 'web' ? 28 : 8) }}
    >
      <Animated.View
        key={id}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        className="w-full max-w-[440px] flex-row items-center gap-2.5 rounded-2xl bg-ink px-3.5 py-3 shadow-[0_10px_30px_rgba(27,22,32,0.25)]"
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-teal">
          <Icon as={CircleCheck} size={15} color="#fff" />
        </View>
        <Text className="flex-1 text-[13.5px] font-bold text-white">{message}</Text>
      </Animated.View>
    </View>
  );
}
