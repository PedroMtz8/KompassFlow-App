import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { ListDivider } from '@/components/ui/list-divider';
import { Text } from '@/components/ui/text';
import { useAdminVerifications, useVerificationCounts, type VerificationStatus } from '@/features/admin/queries';

const day = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(d)) : '';

const EMPTY: Record<VerificationStatus, string> = {
  PENDING: 'No hay solicitudes pendientes. 🎉',
  APPROVED: 'Todavía no has aprobado ningún negocio.',
  REJECTED: 'No hay negocios rechazados.',
};

/** Solicitudes de negocios que quieren salir en Descubrir. Las pendientes, de la más antigua a la más reciente. */
export function AdminVerificationsScreen() {
  const [status, setStatus] = useState<VerificationStatus>('PENDING');
  const counts = useVerificationCounts();
  const q = useAdminVerifications(status);
  const rows = q.data ?? [];
  const n = counts.data;
  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-8" onRefresh={() => Promise.all([q.refetch(), counts.refetch()])}>
        <View className="pb-1 pt-1">
          <Text variant="h2">Solicitudes</Text>
          <Text variant="muted">Comprueba que el negocio exista antes de publicarlo en Descubrir.</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Chip label={`Pendientes${n ? ` · ${n.pending}` : ''}`} selected={status === 'PENDING'} onPress={() => setStatus('PENDING')} />
          <Chip label={`Aprobadas${n ? ` · ${n.approved}` : ''}`} selected={status === 'APPROVED'} onPress={() => setStatus('APPROVED')} />
          <Chip label={`Rechazadas${n ? ` · ${n.rejected}` : ''}`} selected={status === 'REJECTED'} onPress={() => setStatus('REJECTED')} />
        </View>
        <QueryStatus q={q} />
        {q.data && rows.length === 0 ? <Text variant="muted">{EMPTY[status]}</Text> : null}
        <View>
          {rows.map((o, i) => (
            <View key={o.id}>
              <Pressable
                onPress={() => router.push({ pathname: '/admin-verification', params: { id: o.id } } as never)}
                className="flex-row items-center gap-3 py-2.5 active:opacity-80"
              >
                <Avatar uri={o.logo} name={o.name} size={46} radius={15} />
                <View className="min-w-0 flex-1 gap-[3px]">
                  <Text className="text-[14.5px] font-bold" numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                    {o.ownerName ?? 'Sin propietario'} · {o.type === 'PERSONAL' ? 'Independiente' : 'Academia'}
                    {status === 'PENDING' && o.requestedAt
                      ? ` · pidió el ${day(o.requestedAt)}`
                      : o.reviewedAt
                        ? ` · ${day(o.reviewedAt)}`
                        : ''}
                  </Text>
                </View>
                {status === 'APPROVED' ? <Badge tone={o.isPublished ? 'green' : 'ink'}>{o.isPublished ? 'VISIBLE' : 'OCULTA'}</Badge> : null}
                <Icon as={ChevronRight} size={16} />
              </Pressable>
              {i < rows.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
        <LoadMore q={q} label="Ver más solicitudes" />
      </ScreenScroll>
    </Screen>
  );
}
