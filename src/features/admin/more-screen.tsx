import { router } from 'expo-router';
import { History, LogOut, Repeat, Settings, SlidersHorizontal } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { ListRow } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { authClient } from '@/lib/auth-client';
import { signOut } from '@/lib/sign-out';

/** Más: cambiar de espacio, configuración de la cuenta y cerrar sesión. */
export function AdminMoreScreen() {
  const user = authClient.useSession().data?.user;
  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-3 pb-8">
        <View className="gap-0.5 pb-1 pt-1">
          <Text variant="h2">Más</Text>
          <Text variant="muted">{user?.email}</Text>
        </View>
        <ListRow
          icon={SlidersHorizontal}
          tone="orange"
          title="Planes y comisiones"
          note="Precios, límites y comisión por plan"
          chevron
          onPress={() => router.navigate('/plans' as never)}
        />
        <ListRow
          icon={History}
          tone="green"
          title="Bitácora"
          note="Quién hizo qué en la plataforma"
          chevron
          onPress={() => router.push('/admin-audit' as never)}
        />
        <ListRow
          icon={Repeat}
          tone="violet"
          title="Cambiar espacio"
          note="Tus academias o el modo alumno"
          chevron
          onPress={() => router.push('/switch-space')}
        />
        <ListRow
          icon={Settings}
          tone="ink"
          title="Configuración"
          note="Foto, contraseña, Google y privacidad"
          chevron
          onPress={() => router.push('/account')}
        />
        <ListRow
          icon={LogOut}
          tone="pink"
          title="Cerrar sesión"
          onPress={async () => {
            await signOut();
            router.replace('/sign-in');
          }}
        />
      </ScreenScroll>
    </Screen>
  );
}
