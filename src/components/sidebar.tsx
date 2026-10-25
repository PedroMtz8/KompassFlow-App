import { router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import Bell from 'lucide-react-native/icons/bell';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import ChartNoAxesCombined from 'lucide-react-native/icons/chart-no-axes-combined';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Building2 from 'lucide-react-native/icons/building-complex';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Crown from 'lucide-react-native/icons/crown';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import House from 'lucide-react-native/icons/house';
import LogOut from 'lucide-react-native/icons/log-out';
import Repeat from 'lucide-react-native/icons/repeat';
import Search from 'lucide-react-native/icons/search';
import Shapes from 'lucide-react-native/icons/shapes';
import User from 'lucide-react-native/icons/user';
import Wallet from 'lucide-react-native/icons/wallet';
import Users from 'lucide-react-native/icons/users';
import UserRoundCog from 'lucide-react-native/icons/user-round-cog';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { useUnreadCount } from '@/features/notifications/queries';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useActiveOrganization } from '@/features/organizations/queries';
import { roleLabel } from '@/features/organizations/space';
import { can } from '@/features/organizations/permissions';
import { authClient } from '@/lib/auth-client';
import { signOut } from '@/lib/sign-out';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useSpace } from '@/stores/space';
import { BrandMark } from '@/components/brand-mark';

type Item = { path: string; label: string; icon: LucideIcon; show?: boolean };

/** Barra lateral de escritorio (web ancha). En móvil se usan las pestañas inferiores. */
export function Sidebar() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const pathname = usePathname();
  const mode = useSpace((s) => s.mode);
  const { data: session } = authClient.useSession();
  const { org } = useActiveOrganization();
  const inOrg = mode === 'org' && !!org;
  const unread = useUnreadCount().data ?? 0;
  const terms = org?.terms;

  const studentItems: Item[] = [
    { path: '/my-classes', label: 'Mis clases', icon: CalendarDays },
    { path: '/discover', label: 'Descubrir', icon: Search },
    { path: '/membership', label: 'Mis pases', icon: Wallet },
    { path: '/profile', label: 'Perfil', icon: User },
  ];
  const orgItems: Item[] = [
    { path: '/today', label: 'Hoy', icon: House },
    { path: '/schedule', label: 'Agenda', icon: CalendarDays },
    { path: '/services', label: 'Clases', icon: Shapes, show: can(org, 'service', 'read') },
    { path: '/students', label: 'Alumnos', icon: Users, show: can(org, 'student', 'read') },
    { path: '/payments', label: 'Pagos', icon: CreditCard, show: can(org, 'payment', 'read') },
    { path: '/team', label: 'Equipo', icon: UserRoundCog },
    { path: '/rooms', label: terms?.rooms ?? 'Espacios', icon: Building2, show: can(org, 'location', 'read') },
    { path: '/reports', label: 'Reportes', icon: BarChart3, show: can(org, 'report', 'read') },
    { path: '/plan', label: 'Plan', icon: Crown, show: can(org, 'plan', 'read') },
    { path: '/more', label: 'Más', icon: Ellipsis },
  ];
  const adminItems: Item[] = [
    { path: '/overview', label: 'Resumen', icon: ChartNoAxesCombined },
    { path: '/orgs', label: 'Academias', icon: Building2 },
    { path: '/verifications', label: 'Solicitudes', icon: ShieldCheck },
    { path: '/users', label: 'Usuarios', icon: Users },
    { path: '/plans', label: 'Planes', icon: SlidersHorizontal },
    { path: '/admin-audit', label: 'Bitácora', icon: History },
    { path: '/settings', label: 'Más', icon: Ellipsis },
  ];
  const inAdmin = mode === 'admin';
  const items = (inAdmin ? adminItems : inOrg ? orgItems : studentItems).filter((i) => i.show !== false);

  return (
    <View
      className="w-[264px] border-r border-ink/[0.07] bg-card"
      style={{ paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View className="flex-row items-center gap-[9px] px-5 pb-5">
        <BrandMark size={30} />
        <Text className="text-xl font-extrabold tracking-[-0.025em]">Kompass</Text>
      </View>

      <Pressable
        onPress={() => router.push('/switch-space')}
        className="mx-3 mb-3 flex-row items-center gap-2.5 rounded-2xl bg-background px-3 py-2.5 active:opacity-80"
      >
        <Avatar
          name={inOrg ? org?.name : session?.user.name}
          uri={inOrg ? (org?.logo ?? org?.coverImage) : undefined}
          size={36}
          radius={12}
        />
        <View className="min-w-0 flex-1 gap-px">
          <Text className="text-[13px] font-bold" numberOfLines={1}>
            {inAdmin ? 'Administración' : inOrg ? org?.name : 'Modo alumno'}
          </Text>
          <Text className="text-[11px] font-semibold text-muted-foreground" numberOfLines={1}>
            {inAdmin ? 'Plataforma Kompass' : inOrg ? roleLabel(org!.role, terms?.instructor) : 'Descubrir y reservar'}
          </Text>
        </View>
        <Icon as={Repeat} size={15} color={t.subtle} />
      </Pressable>

      <ScrollView className="flex-1" contentContainerClassName="gap-0.5 px-3" showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const active = pathname === it.path;
          return (
            <Pressable
              key={it.path}
              onPress={() => router.navigate(it.path as never)}
              className={cn('flex-row items-center gap-3 overflow-hidden rounded-[14px] px-3 py-2.5 active:opacity-80', !active && 'hover:bg-background')}
            >
              {active ? (
                <LinearGradient
                  colors={[t.primaryLight, t.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              ) : null}
              {/* El icono (svg) va en un View: en la web un svg suelto se pinta debajo del degradado absoluto. */}
              <View>
                <Icon as={it.icon} size={19} color={active ? '#fff' : t.mutedForeground} strokeWidth={active ? 2.3 : 1.9} />
              </View>
              <Text className={cn('text-sm font-bold', active ? 'text-white' : 'text-muted-foreground')}>{it.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => router.navigate('/notifications' as never)}
          className={cn('flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:opacity-80', pathname === '/notifications' ? 'bg-primary-soft' : 'hover:bg-background')}
        >
          <Icon as={Bell} size={19} color={pathname === '/notifications' ? t.primary : t.mutedForeground} />
          <Text className={cn('flex-1 text-sm font-bold', pathname === '/notifications' ? 'text-primary' : 'text-muted-foreground')}>Avisos</Text>
          {unread > 0 ? (
            <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
              <Text className="text-[10.5px] font-extrabold text-white">{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      <View className="mx-3 mt-2 flex-row items-center gap-2.5 border-t border-ink/[0.07] px-2 pt-3">
        <Pressable
          onPress={() => router.push('/account')}
          accessibilityLabel="Configuración"
          className="min-w-0 flex-1 flex-row items-center gap-2.5 active:opacity-80"
        >
          <Avatar uri={session?.user.image} name={session?.user.name} size={32} />
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold" numberOfLines={1}>
              {session?.user.name}
            </Text>
            <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
              {session?.user.email}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Cerrar sesión"
          onPress={async () => {
            await signOut();
            router.replace('/sign-in');
          }}
          className="h-8 w-8 items-center justify-center rounded-lg active:opacity-70"
        >
          <Icon as={LogOut} size={16} color={t.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
