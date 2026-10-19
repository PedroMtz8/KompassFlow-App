import { router } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Plus from 'lucide-react-native/icons/plus';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { RefreshButton } from '@/components/ui/refresh-button';
import { useRefresh } from '@/lib/use-refresh';
import { TimeZoneBanner } from '@/components/timezone';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { ListDivider } from '@/components/ui/list-divider';
import { Text } from '@/components/ui/text';
import { SessionRow } from '@/features/classes/session-row';
import { WeekCalendar } from '@/features/classes/week-calendar';
import { useClassContext } from '@/features/classes/use-class-context';
import { can } from '@/features/organizations/permissions';
import { useSessions } from '@/features/organizations/queries';
import { addDays, dayNumber, localDateOf, longDate, monthShort, startOfWeek, weekdayShort } from '@/lib/dates';
import { useIsDesktop } from '@/lib/use-layout';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

/** Agenda semanal: en móvil, tira de días + lista; en escritorio, las 7 columnas de la semana. */
export function ScheduleScreen() {
  const t = useTheme();
  const ctx = useClassContext();
  const desktop = useIsDesktop();
  const now = useNow();
  const [today] = useState(() => localDateOf(Date.now(), ctx.tz));
  const [week, setWeek] = useState(() => startOfWeek(localDateOf(Date.now(), ctx.tz)));
  const [day, setDay] = useState(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const sessions = useSessions(ctx.activeId, days[0], days[6]);
  const tz = sessions.data?.timezone ?? ctx.tz;
  const { refresh, busy } = useRefresh(['orgs', ctx.activeId ?? '']);
  const byDay = (d: string) => (sessions.data?.sessions ?? []).filter((s) => s.date === d);
  const canCreate = can(ctx.org, 'session', 'create');
  const shift = (n: number) => {
    setWeek(addDays(week, n * 7));
    setDay(addDays(day, n * 7));
  };
  const title = `${monthShort(days[0])} ${dayNumber(days[0])} – ${monthShort(days[6])} ${dayNumber(days[6])}`;

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-10" onRefresh={refresh}>
        <TimeZoneBanner tz={tz} />
        <View className="flex-row items-center gap-2 pt-1">
          <Text variant="h1" className="flex-1">
            Agenda
          </Text>
          {desktop ? <RefreshButton onPress={refresh} busy={busy} /> : null}
          {canCreate ? (
            <Pressable
              onPress={() => router.push('/new-class')}
              className="h-10 w-10 items-center justify-center rounded-[14px] bg-primary shadow-[0_10px_20px_-8px_var(--color-primary-glow)] active:opacity-80"
            >
              <Icon as={Plus} size={18} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2 pb-1">
          <Pressable
            onPress={() => {
              setWeek(startOfWeek(today));
              setDay(today);
            }}
            className="h-10 items-center justify-center rounded-[14px] border border-ink/[0.05] bg-card px-3.5 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_6px_14px_-4px_rgba(16,32,26,0.10)] active:opacity-70"
          >
            <Text className="text-[12.5px] font-bold">Hoy</Text>
          </Pressable>
          <Text className="flex-1 text-center font-mono text-[12px] text-muted-foreground">{title}</Text>
          <Pressable onPress={() => shift(-1)} className="h-10 w-10 items-center justify-center rounded-[14px] border border-ink/[0.05] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.05),0_6px_14px_-4px_rgba(16,32,26,0.10)] active:opacity-70">
            <Icon as={ChevronLeft} size={18} />
          </Pressable>
          <Pressable onPress={() => shift(1)} className="h-10 w-10 items-center justify-center rounded-[14px] border border-ink/[0.05] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.05),0_6px_14px_-4px_rgba(16,32,26,0.10)] active:opacity-70">
            <Icon as={ChevronRight} size={18} />
          </Pressable>
        </View>

        <QueryStatus q={sessions} />

        {desktop ? (
          <WeekCalendar days={days} today={today} sessions={sessions.data?.sessions ?? []} tz={tz} now={now} />
        ) : (
          <>
            <View className="flex-row gap-1.5">
              {days.map((d) => {
                const on = d === day;
                const has = byDay(d).length > 0;
                const inner = (
                  <>
                    <Text className={cn('text-[10.5px] font-extrabold uppercase', on ? 'text-white' : 'text-muted-foreground')}>
                      {weekdayShort(d)}
                    </Text>
                    <Text className={cn('font-mono-bold text-base', on && 'text-white')}>{dayNumber(d)}</Text>
                    <View className="h-1 w-1 rounded-full" style={{ backgroundColor: has ? (on ? '#fff' : t.primary) : 'transparent' }} />
                  </>
                );
                return (
                  <Pressable key={d} onPress={() => setDay(d)} className="flex-1 overflow-hidden rounded-2xl">
                    {on ? (
                      <Gradient tone="orange" style={{ alignItems: 'center', gap: 2, paddingVertical: 8 }}>
                        {inner}
                      </Gradient>
                    ) : (
                      <View className="items-center gap-0.5 bg-card py-2">{inner}</View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text variant="overline">{longDate(day)}</Text>
            {!sessions.isPending && !sessions.isError && byDay(day).length === 0 ? (
              <View className="items-center gap-1 rounded-[20px] bg-card p-5">
                <Text className="text-sm font-bold">Sin sesiones este día</Text>
                {canCreate ? <Text variant="muted">Crea una clase para llenar tu agenda.</Text> : null}
              </View>
            ) : null}
            <View>
              {byDay(day).map((s, i, arr) => (
                <View key={s.id}>
                  <SessionRow s={s} tz={tz} />
                  {i < arr.length - 1 ? <ListDivider /> : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
