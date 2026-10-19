import { onlineManager } from '@tanstack/react-query';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Si hay internet. Sin él la app solo consulta lo último que guardó y no permite cambios. */
export function useIsOnline() {
  return useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline(), () => true);
}

/** Pastilla discreta en la parte superior mientras no haya conexión. Va una sola vez en el layout raíz. */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0 items-center" style={{ paddingTop: insets.top + 4 }}>
      <View className="flex-row items-center gap-1.5 rounded-full bg-ink px-3 py-1.5">
        <Icon as={WifiOff} size={12} color="#fff" />
        <Text className="text-[11.5px] font-bold text-white">Sin conexión · solo consulta</Text>
      </View>
    </View>
  );
}
