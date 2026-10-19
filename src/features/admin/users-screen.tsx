import { router } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ListDivider } from '@/components/ui/list-divider';
import { Text } from '@/components/ui/text';
import { useAdminUsers } from '@/features/admin/queries';
import { roleLabel } from '@/features/organizations/space';
import { useDebounced } from '@/lib/use-debounced';

const day = (d: Date | string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

/** Todas las cuentas de la plataforma, con las academias donde participan. */
export function AdminUsersScreen() {
  const [search, setSearch] = useState('');
  const q = useAdminUsers(useDebounced(search.trim()));
  const users = q.data ?? [];
  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-8" onRefresh={() => q.refetch()}>
        <View className="pb-1 pt-1">
          <Text variant="h2">Usuarios</Text>
        </View>
        <View className="h-[52px] flex-row items-center gap-2.5 rounded-[18px] border border-ink/[0.05] bg-card px-4 shadow-[0_1px_2px_rgba(16,32,26,0.04),0_10px_22px_-10px_rgba(16,32,26,0.14)]">
          <Icon as={Search} size={18} color="#A69DAB" />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o correo"
            className="h-12 flex-1 border-0 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
          />
        </View>
        <QueryStatus q={q} />
        {q.data && users.length === 0 ? <Text variant="muted">Sin resultados.</Text> : null}
        <View>
          {users.map((u, i) => (
            <View key={u.id}>
              <Pressable
                onPress={() => router.push({ pathname: '/admin-user', params: { id: u.id } } as never)}
                className="flex-row items-center gap-3 py-2.5 active:opacity-80"
              >
                <Avatar uri={u.image} name={u.name} size={44} />
                <View className="min-w-0 flex-1 gap-[3px]">
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Text className="shrink text-[14.5px] font-bold" numberOfLines={1}>
                      {u.name}
                    </Text>
                    {u.isPlatformAdmin ? <Badge tone="ink">ADMIN</Badge> : null}
                    {u.suspended ? <Badge tone="pink">SUSPENDIDA</Badge> : null}
                    {!u.emailVerified ? <Badge tone="amber">SIN CONFIRMAR</Badge> : null}
                  </View>
                  <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
                    {u.email}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={2}>
                    {u.organizations.length
                      ? u.organizations.map((o) => `${o.name} (${roleLabel(o.role).toLowerCase()})`).join(' · ')
                      : 'Sin academias'}
                    {u.studentIn ? ` · alumno en ${u.studentIn}` : ''}
                  </Text>
                </View>
                <Text className="text-[11px] text-muted-foreground">{day(u.createdAt)}</Text>
              </Pressable>
              {i < users.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
        <LoadMore q={q} label="Ver más usuarios" />
      </ScreenScroll>
    </Screen>
  );
}
