import { router } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUnreadCount } from '@/features/notifications/queries';

/** Campana de avisos con el contador de los que faltan por leer. */
export function NotificationBell() {
  const unread = useUnreadCount().data ?? 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      accessibilityLabel={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}
      className="h-[38px] w-[38px] items-center justify-center rounded-xl bg-card active:opacity-80"
    >
      <Icon as={Bell} size={19} />
      {unread > 0 ? (
        <View className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-[10.5px] font-extrabold text-white">{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
