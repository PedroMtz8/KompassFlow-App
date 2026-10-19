import { router } from 'expo-router';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Flame from 'lucide-react-native/icons/flame';
import Repeat from 'lucide-react-native/icons/repeat';
import Settings from 'lucide-react-native/icons/settings';
import Store from 'lucide-react-native/icons/store';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { ListDivider } from '@/components/ui/list-divider';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { TintedStat } from '@/components/ui/tinted-stat';
import { useProfileSummary } from '@/features/bookings/queries';
import { useCatalog, useMyInterests, useSaveInterests } from '@/features/interests/queries';
import { formatTime, relativeDay } from '@/lib/dates';
import { authClient } from '@/lib/auth-client';
import { useIsDesktop } from '@/lib/use-layout';

const monthYear = (d: Date | string) => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(d));
const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`);
const levelLabel = { NEW: 'Nuevo', BEGINNER: 'Básico', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado' } as const;

/**
 * Perfil: el resumen de la persona como alumna (desde cuándo baila, en qué academias, cuántas clases y horas, qué practica) y
 * sus intereses. Lo de la cuenta (contraseña, Google, privacidad, cerrar sesión…) vive en Configuración.
 */
export function ProfileScreen() {
  const user = authClient.useSession().data?.user;
  const desktop = useIsDesktop();
  const q = useProfileSummary();
  const s = q.data;
  const catalog = useCatalog();
  const mine = useMyInterests();
  const save = useSaveInterests();
  const selected = mine.data?.disciplineIds ?? [];
  const toggle = (id: string) => save.mutate({ disciplineIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  const maxClasses = Math.max(1, ...(s?.disciplines.map((d) => d.classes) ?? [1]));

  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-3 pb-8" onRefresh={() => q.refetch()}>
        <View className="flex-row items-center justify-between pb-1 pt-1">
          <Text variant="h2">Perfil</Text>
          <View className="flex-row items-center gap-2">
            {desktop ? <RefreshButton onPress={() => q.refetch()} busy={q.isFetching} /> : null}
            <Pressable
              onPress={() => router.push('/account')}
              accessibilityLabel="Configuración"
              className="h-10 flex-row items-center gap-1.5 rounded-[14px] border border-ink/[0.05] bg-card px-3.5 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_6px_14px_-4px_rgba(16,32,26,0.10)] active:opacity-80"
            >
              <Icon as={Settings} size={17} />
              <Text className="text-[13px] font-bold">Configuración</Text>
            </Pressable>
          </View>
        </View>

        <Gradient tone="orange" style={{ borderRadius: 26, padding: 16, gap: 12 }}>
          <View className="flex-row items-center gap-3">
            <Avatar uri={user?.image} name={user?.name} size={58} radius={20} ring />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-lg font-extrabold text-white" numberOfLines={1}>
                {user?.name}
              </Text>
              <Text className="text-[12.5px] font-semibold text-white/90">
                {s?.since && s.attended > 0 ? `Bailando desde ${monthYear(s.since)}` : s?.since ? `En KompassFlow desde ${monthYear(s.since)}` : 'Aún no tomas tu primera clase'}
              </Text>
            </View>
          </View>
          {s && s.attended > 0 ? (
            <Text className="text-[12.5px] text-white/90">
              {s.attended} {s.attended === 1 ? 'clase' : 'clases'} · {hours(s.minutes)} bailadas
              {s.attendanceRate != null ? ` · ${s.attendanceRate}% de asistencia` : ''}
            </Text>
          ) : null}
        </Gradient>

        <Pressable
          onPress={() => router.push('/switch-space')}
          accessibilityRole="button"
          accessibilityLabel="Cambiar espacio"
          className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3 active:opacity-80"
        >
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary-soft">
            <Icon as={Repeat} size={17} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold">Cambiar espacio</Text>
            <Text className="text-xs text-muted-foreground">Pasa a tu academia o vuelve al modo alumno</Text>
          </View>
          <Icon as={ChevronRight} size={18} />
        </Pressable>

        <QueryStatus q={q} />
        {s ? (
          <>
            <View className="flex-row gap-2.5">
              <TintedStat icon={CalendarCheck} tone="teal" value={String(s.attended)} label="clases tomadas" />
              <TintedStat icon={Clock} tone="violet" value={hours(s.minutes)} label="bailadas" />
            </View>
            <View className="flex-row gap-2.5">
              <TintedStat icon={Flame} tone="orange" value={String(s.last30)} label="en los últimos 30 días" />
              <TintedStat icon={Store} tone="amber" value={String(s.organizations.length)} label={s.organizations.length === 1 ? 'academia' : 'academias'} />
            </View>

            {s.organizations.length ? (
              <>
                <SectionHeader title="Mis academias" className="pt-1" />
                <View className="gap-2">
                  {s.organizations.map((o) => (
                    <Pressable
                      key={o.organizationId}
                      onPress={() => router.push({ pathname: '/org/[id]', params: { id: o.organizationId } })}
                      className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 active:opacity-90"
                    >
                      <Avatar uri={o.logo} name={o.name} size={42} radius={14} />
                      <View className="min-w-0 flex-1 gap-[3px]">
                        <Text className="text-sm font-bold" numberOfLines={1}>
                          {o.name}
                        </Text>
                        <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                          Alumno desde {monthYear(o.since)} · {o.attended} {o.attended === 1 ? 'clase' : 'clases'} · {hours(o.minutes)}
                        </Text>
                        <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                          {o.lastClassAt ? `Última clase: ${relativeDay(+new Date(o.lastClassAt), o.timezone)}` : 'Aún no asiste a una clase'}
                          {o.upcoming ? ` · ${o.upcoming} ${o.upcoming === 1 ? 'reservada' : 'reservadas'}` : ''}
                        </Text>
                      </View>
                      <Badge tone="ink">{levelLabel[o.level].toUpperCase()}</Badge>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <View className="items-center gap-1.5 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
                <Text className="text-base font-extrabold">Tu historial empieza con tu primera clase</Text>
                <Text variant="muted" className="text-center">Reserva en Descubrir y aquí verás tu camino: academias, clases y horas.</Text>
                <Pressable onPress={() => router.replace('/discover')} className="mt-1 rounded-xl bg-primary px-4 py-2.5 active:opacity-80">
                  <Text className="text-[13px] font-bold text-white">Descubrir clases</Text>
                </Pressable>
              </View>
            )}

            {s.disciplines.length ? (
              <>
                <SectionHeader title="Lo que has bailado" className="pt-1" />
                <View className="gap-3 rounded-[22px] bg-card p-3.5">
                  {s.disciplines.map((d) => (
                    <View key={d.name} className="gap-1.5">
                      <View className="flex-row justify-between">
                        <Text className="text-[13px] font-bold">{d.name}</Text>
                        <Text className="font-mono-bold text-xs text-muted-foreground">
                          {d.classes} {d.classes === 1 ? 'clase' : 'clases'} · {hours(d.minutes)}
                        </Text>
                      </View>
                      <ProgressBar value={d.classes / maxClasses} tone="teal" height={7} />
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {s.recent.length ? (
              <>
                <View className="flex-row items-center justify-between">
                  <SectionHeader title="Últimas clases" className="pt-1" />
                  <Pressable onPress={() => router.push('/my-classes')} hitSlop={8}>
                    <Text className="text-[12.5px] font-bold text-primary">Ver todo</Text>
                  </Pressable>
                </View>
                <View className="-mt-1.5">
                  {s.recent.map((r, i) => (
                    <View key={`${r.startsAt}-${i}`}>
                      <View className="flex-row items-center gap-3 py-[9px]">
                        <View className="min-w-0 flex-1 gap-[3px]">
                          <Text className="text-sm font-bold" numberOfLines={1}>
                            {r.service}
                          </Text>
                          <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                            {relativeDay(+new Date(r.startsAt), r.timezone)} · {formatTime(r.startsAt, r.timezone)} · {r.organizationName}
                          </Text>
                        </View>
                        <Badge tone="teal">ASISTIÓ</Badge>
                      </View>
                      {i < s.recent.length - 1 ? <ListDivider /> : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : null}

        <SectionHeader title="Mis intereses" className="pt-2" />
        {catalog.isPending || mine.isPending ? (
          <ActivityIndicator />
        ) : catalog.isError || mine.isError ? (
          <Text variant="muted">No pudimos cargar tus intereses.</Text>
        ) : (
          catalog.data
            .filter((v) => v.isActive)
            .map((v) => (
              <View key={v.id} className="gap-2">
                {catalog.data.filter((x) => x.isActive).length > 1 ? <Text variant="overline">{v.name}</Text> : null}
                <View className="flex-row flex-wrap gap-2">
                  {v.disciplines.map((d) => (
                    <Chip key={d.id} label={d.name} selected={selected.includes(d.id)} onPress={() => toggle(d.id)} />
                  ))}
                </View>
              </View>
            ))
        )}
        <Text variant="muted" className="text-xs">
          Personalizan lo que ves en Descubrir («Para ti»). Nunca bloquean nada y puedes cambiarlos cuando quieras.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}
