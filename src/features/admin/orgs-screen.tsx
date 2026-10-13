import { router } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';
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
import { useAdminOrgs } from '@/features/admin/queries';
import { formatMoney } from '@/lib/dates';
import { useDebounced } from '@/lib/use-debounced';

export const PLAN_NAME: Record<string, string> = { free: 'Gratis', starter: 'Starter', pro: 'Pro', business: 'Business' };

/** Todas las academias de la plataforma, con su plan, alumnos y lo cobrado con tarjeta. */
export function AdminOrgsScreen() {
  const [search, setSearch] = useState('');
  const q = useAdminOrgs(useDebounced(search.trim()));
  const orgs = q.data ?? [];
  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-8" onRefresh={() => q.refetch()}>
        <View className="pb-1 pt-1">
          <Text variant="h2">Academias</Text>
        </View>
        <View className="h-12 flex-row items-center gap-2.5 rounded-[15px] bg-card px-3.5">
          <Icon as={Search} size={18} color="#A69DAB" />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por academia o propietario"
            className="h-12 flex-1 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
          />
        </View>
        <QueryStatus q={q} />
        {q.data && orgs.length === 0 ? <Text variant="muted">Sin resultados.</Text> : null}
        <View>
          {orgs.map((o, i) => (
            <View key={o.id}>
              <Pressable
                onPress={() => router.push({ pathname: '/admin-org', params: { id: o.id } } as never)}
                className="flex-row items-center gap-3 py-2.5 active:opacity-80"
              >
                <Avatar uri={o.logo} name={o.name} size={46} radius={15} />
                <View className="min-w-0 flex-1 gap-[3px]">
                  <Text className="text-[14.5px] font-bold" numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                    {o.ownerName ?? 'Sin propietario'} · {o.students} {o.students === 1 ? 'alumno' : 'alumnos'}
                    {o.cardPayments ? ` · ${formatMoney(o.cardVolumeCents, 'MXN')} con tarjeta` : ''}
                  </Text>
                </View>
                <Badge tone={o.plan === 'free' ? 'ink' : o.planStatus === 'trialing' ? 'amber' : 'green'}>
                  {`${(PLAN_NAME[o.plan] ?? o.plan).toUpperCase()}${o.planStatus === 'trialing' ? ' · PRUEBA' : ''}`}
                </Badge>
                <Icon as={ChevronRight} size={16} />
              </Pressable>
              {i < orgs.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
        <LoadMore q={q} label="Ver más academias" />
      </ScreenScroll>
    </Screen>
  );
}
