import { router } from 'expo-router';
import { BarChart3, Building2, CalendarClock, CalendarPlus, Crown, Shapes, Pencil, Repeat, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { ListRow } from '@/components/ui/list-row';
import { Avatar } from '@/components/ui/avatar';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization } from '@/features/organizations/queries';
import { authClient } from '@/lib/auth-client';
import { Text } from '@/components/ui/text';

/** Pestaña Más: acceso a configuración de la academia (no dibujada en el diseño). */
export function MoreScreen() {
  const user = authClient.useSession().data?.user;
  const { org } = useActiveOrganization();
  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-2.5 pb-6">
        <View className="pb-1.5 pt-1">
          <Text variant="h2">Más</Text>
        </View>
        <Pressable
          onPress={() => router.push('/account')}
          className="flex-row items-center gap-3 rounded-[22px] bg-card p-3 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-90"
        >
          <Avatar uri={user?.image} name={user?.name} size={44} radius={15} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-[14.5px] font-bold" numberOfLines={1}>
              {user?.name}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              Configuración · cuenta, contraseña y cerrar sesión
            </Text>
          </View>
        </Pressable>
        {can(org, 'service', 'read') ? (
          <ListRow
            icon={Shapes}
            tone="orange"
            title="Clases y servicios"
            note="Catálogo, precios y horarios"
            chevron
            onPress={() => router.push('/services')}
          />
        ) : null}
        {can(org, 'session', 'create') ? (
          <ListRow
            icon={CalendarPlus}
            tone="amber"
            title="Nueva clase"
            note="Con sesiones recurrentes"
            chevron
            onPress={() => router.push('/new-class')}
          />
        ) : null}
        {can(org, 'session', 'teach') ? (
          <ListRow
            icon={CalendarClock}
            tone="blue"
            title="Disponibilidad de privadas"
            note="Horarios 1:1"
            chevron
            onPress={() => router.push('/availability')}
          />
        ) : null}
        {can(org, 'organization', 'update') ? (
          <ListRow
            icon={Pencil}
            tone="amber"
            title="Editar academia"
            note="Perfil público y contacto"
            chevron
            onPress={() => router.push('/edit-academy')}
          />
        ) : null}
        {can(org, 'report', 'read') ? (
          <ListRow
            icon={BarChart3}
            tone="orange"
            title="Reportes"
            note="Asistencia, ocupación y retención"
            chevron
            onPress={() => router.push('/reports')}
          />
        ) : null}
        {can(org, 'location', 'read') ? (
          <ListRow
            icon={Building2}
            tone="violet"
            title="Ubicación y salones"
            note="Capacidad y ocupación"
            chevron
            onPress={() => router.push('/rooms')}
          />
        ) : null}
        <ListRow
          icon={Users}
          tone="teal"
          title="Equipo y roles"
          note="Personas, roles y permisos"
          chevron
          onPress={() => router.push('/team')}
        />
        {can(org, 'product', 'read') ? (
          <ListRow
            icon={Repeat}
            tone="amber"
            title="Precios y paquetes"
            note="Productos y métodos de pago"
            chevron
            onPress={() => router.push('/pricing')}
          />
        ) : null}
        {can(org, 'plan', 'read') ? (
          <ListRow icon={Crown} tone="pink" title="Tu plan" note="Plan, uso y facturación" chevron onPress={() => router.push('/plan')} />
        ) : null}
        <ListRow
          icon={Repeat}
          tone="ink"
          title="Cambiar espacio"
          note="Otras academias y modo alumno"
          chevron
          onPress={() => router.push('/switch-space')}
        />
      </ScreenScroll>
    </Screen>
  );
}
