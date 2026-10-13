import { router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useStudents } from '@/features/bookings/queries';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization } from '@/features/organizations/queries';
import { useRefresh } from '@/lib/use-refresh';
import { useIsDesktop } from '@/lib/use-layout';
import { RefreshButton } from '@/components/ui/refresh-button';

const levelLabel = { NEW: 'Nuevo', BEGINNER: 'Básico', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado' } as const;

/** Alumnos de la organización (con o sin cuenta). */
export function StudentsScreen() {
  const { activeId, org } = useActiveOrganization();
  const [q, setQ] = useState('');
  const students = useStudents(activeId, q.trim() || undefined);
  const desktop = useIsDesktop();
  const canCreate = can(org, 'student', 'create');
  const { refresh, busy } = useRefresh(['orgs', activeId ?? '']);

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-10" onRefresh={refresh}>
        <View className="flex-row items-center justify-between pb-1 pt-1">
          <Text variant="h2">Alumnos</Text>
          {desktop ? <RefreshButton onPress={refresh} busy={busy} /> : null}
          {canCreate ? (
            <Pressable
              onPress={() => router.push('/new-student')}
              className="h-[38px] w-[38px] items-center justify-center rounded-xl bg-primary active:opacity-80"
            >
              <Icon as={Plus} size={19} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <View className="h-12 flex-row items-center gap-2.5 rounded-[15px] bg-card px-3.5">
          <Icon as={Search} size={18} color="#A69DAB" />
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nombre, teléfono o correo"
            className="h-12 flex-1 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
          />
        </View>

        <QueryStatus q={students} />
        {!students.isPending && !students.isError && students.data?.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[22px] bg-card p-6">
            <Text className="text-base font-extrabold">{q ? 'Sin resultados' : 'Todavía no hay alumnos'}</Text>
            <Text variant="muted" className="text-center">
              {q ? 'Prueba con otro nombre o teléfono.' : 'Aparecen aquí cuando reservan, o puedes darlos de alta en recepción.'}
            </Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2.5">
          {students.data?.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: '/student-detail', params: { studentId: s.id } })}
              className="w-full flex-row items-center gap-[11px] rounded-[20px] bg-card px-3.5 py-3 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-90"
              style={{ width: desktop ? '49%' : '100%' }}
            >
              <Avatar uri={s.image} name={s.name} size={40} />
              <View className="min-w-0 flex-1 gap-[3px]">
                <Text className="text-sm font-bold" numberOfLines={1}>
                  {s.name}
                </Text>
                <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                  {[levelLabel[s.level], s.upcoming ? `${s.upcoming} próxima${s.upcoming === 1 ? '' : 's'}` : null, s.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Badge tone={s.hasAccount ? 'teal' : 'amber'}>{s.hasAccount ? 'CON CUENTA' : 'SIN CUENTA'}</Badge>
            </Pressable>
          ))}
        </View>
        <LoadMore q={students} label="Cargar más alumnos" />
      </ScreenScroll>
    </Screen>
  );
}
