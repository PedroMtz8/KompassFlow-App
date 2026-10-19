import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { SessionItem } from '@/features/organizations/queries';
import { toneFor } from '@/features/session/switch-space-screen';
import { dayNumber, formatTime, weekdayShort } from '@/lib/dates';
import { useTones } from '@/lib/tones';
import { cn } from '@/lib/utils';

const HOUR_H = 56;
const GUTTER = 52;
const DEFAULT_START = 7;
const DEFAULT_END = 22;

const minutesOf = (ms: number | Date, tz: string) => {
  const [h, m] = formatTime(ms, tz).split(':').map(Number);
  return h * 60 + m;
};

type Placed = { s: SessionItem; start: number; end: number; lane: number; lanes: number };

/** Reparte en carriles las sesiones que se traslapan dentro de un mismo día. */
function layout(list: SessionItem[], tz: string): Placed[] {
  const items = list
    .map((s) => {
      const start = minutesOf(+new Date(s.startsAt), tz);
      const end = Math.max(start + 25, start + Math.round((+new Date(s.endsAt) - +new Date(s.startsAt)) / 60000));
      return { s, start, end, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = lanes;
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return items;
}

type Props = {
  days: string[];
  today: string;
  sessions: SessionItem[];
  tz: string;
  now: number;
};

/** Calendario semanal con eje de horas: cada sesión es un bloque posicionado por su hora y duración. */
export function WeekCalendar({ days, today, sessions, tz, now }: Props) {
  const tones = useTones();
  const mins = sessions.map((s) => minutesOf(+new Date(s.startsAt), tz));
  const ends = sessions.map((s) => minutesOf(+new Date(s.endsAt), tz));
  const startHour = Math.max(0, Math.min(DEFAULT_START, mins.length ? Math.floor(Math.min(...mins) / 60) : DEFAULT_START));
  const endHour = Math.min(24, Math.max(DEFAULT_END, ends.length ? Math.ceil(Math.max(...ends) / 60) + 1 : DEFAULT_END));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_H;
  const nowMin = minutesOf(now, tz);
  const showNow = days.includes(today) && nowMin >= startHour * 60 && nowMin <= endHour * 60;

  return (
    <View className="overflow-hidden rounded-3xl bg-card border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
      {/* Encabezado de días */}
      <View className="flex-row border-b border-ink/[0.07]" style={{ paddingLeft: GUTTER }}>
        {days.map((d) => {
          const isToday = d === today;
          return (
            <View key={d} className="flex-1 items-center gap-0.5 py-3">
              <Text
                className={cn(
                  'text-[10.5px] font-extrabold uppercase tracking-[0.05em]',
                  isToday ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {weekdayShort(d)}
              </Text>
              <View className={cn('h-8 w-8 items-center justify-center rounded-full', isToday && 'bg-primary')}>
                <Text className={cn('font-mono-bold text-base', isToday && 'text-white')}>{dayNumber(d)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Cuadrícula */}
      <View className="flex-row" style={{ height }}>
        <View style={{ width: GUTTER }}>
          {hours.map((h) => (
            <View key={h} style={{ height: HOUR_H }} className="items-end pr-2">
              <Text className="-mt-[7px] font-mono text-[10.5px] text-subtle">{`${String(h).padStart(2, '0')}:00`}</Text>
            </View>
          ))}
        </View>

        {days.map((d) => {
          const placed = layout(
            sessions.filter((s) => s.date === d),
            tz
          );
          return (
            <View key={d} className={cn('flex-1 border-l border-ink/[0.06]', d === today && 'bg-primary-soft/40')}>
              {hours.map((h, i) => (
                <View key={h} className={cn('border-ink/[0.06]', i > 0 && 'border-t')} style={{ height: HOUR_H }} />
              ))}

              {placed.map(({ s, start, end, lane, lanes }) => {
                const tone = tones[toneFor(s.serviceId)];
                const canceled = s.status === 'CANCELED';
                const top = ((start - startHour * 60) / 60) * HOUR_H;
                const h = Math.max(26, ((end - start) / 60) * HOUR_H - 2);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push({ pathname: '/session', params: { sessionId: s.id, date: s.date } })}
                    className="absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 active:opacity-80"
                    style={{
                      top,
                      height: h,
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                      backgroundColor: tone.soft,
                      borderLeftColor: tone.solid,
                      opacity: canceled ? 0.45 : 1,
                    }}
                  >
                    <Text
                      className={cn('text-[11.5px] font-bold leading-[14px]', canceled && 'line-through')}
                      style={{ color: tone.ink }}
                      numberOfLines={h > 44 ? 2 : 1}
                    >
                      {s.serviceName}
                    </Text>
                    {h > 40 ? (
                      <Text className="text-[10.5px] leading-[13px]" style={{ color: tone.deep }} numberOfLines={1}>
                        {formatTime(s.startsAt, tz)} · {canceled ? 'Cancelada' : `${s.booked}/${s.capacity}`}
                      </Text>
                    ) : null}
                    {h > 62 ? (
                      <Text className="text-[10.5px] leading-[13px]" style={{ color: tone.deep }} numberOfLines={1}>
                        {[s.roomName, s.instructorName].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}

              {showNow && d === today ? (
                <View
                  pointerEvents="none"
                  className="absolute inset-x-0 h-0.5 bg-primary"
                  style={{ top: ((nowMin - startHour * 60) / 60) * HOUR_H }}
                >
                  <View className="-ml-1 -mt-[3px] h-2 w-2 rounded-full bg-primary" />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
