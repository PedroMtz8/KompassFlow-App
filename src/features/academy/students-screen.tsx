import { router } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
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
              className="h-10 w-10 items-center justify-center rounded-[14px] bg-primary shadow-[0_10px_20px_-8px_var(--color-primary-glow)] active:opacity-80"
            >
              <Icon as={Plus} size={19} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <View className="h-[52px] flex-row items-center gap-2.5 rounded-[18px] border border-ink/[0.05] bg-card px-4 shadow-[0_1px_2px_rgba(16,32,26,0.04),0_10px_22px_-10px_rgba(16,32,26,0.14)]">
          <Icon as={Search} size={18} color="#A69DAB" />
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nombre, teléfono o correo"
            className="h-12 flex-1 border-0 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
          />
        </View>

        <QueryStatus q={students} />
        {!students.isPending && !students.isError && students.data?.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
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
              className="w-full flex-row items-center gap-[11px] rounded-[20px] bg-card px-3.5 py-3 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)] active:opacity-90"
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
              <Badge tone={s.hasAccount ? 'green' : 'amber'}>{s.hasAccount ? 'CON CUENTA' : 'SIN CUENTA'}</Badge>
            </Pressable>
          ))}
        </View>
        <LoadMore q={students} label="Cargar más alumnos" />
      </ScreenScroll>
    </Screen>
  );
}
