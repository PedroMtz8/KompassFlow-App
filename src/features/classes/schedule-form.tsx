import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { FormGroup } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { TimeField } from '@/components/ui/time-field';
import { Text } from '@/components/ui/text';
import type { ScheduleBody } from '@/features/organizations/queries';
import { addDays, countDates, dayNumber, localDateOf, weekdayOf, weekdayShort } from '@/lib/dates';
import { cn } from '@/lib/utils';

export type ScheduleState = {
  roomId: string;
  instructorId: string;
  time: string;
  startDate: string;
  /** 0 = solo una vez. */
  repeatWeeks: 0 | 4 | 8 | 12;
  weekdays: number[];
  /** Vacío = cupo del espacio. */
  capacity: string;
};

type Room = { id: string; name: string; capacity: number };
type Instructor = { userId: string; name: string };

export function initialSchedule(rooms: Room[], instructors: Instructor[], meId: string | undefined, tz: string): ScheduleState {
  const startDate = addDays(localDateOf(Date.now(), tz), 1);
  const me = instructors.find((i) => i.userId === meId) ?? instructors[0];
  return {
    roomId: rooms[0]?.id ?? '',
    instructorId: me?.userId ?? '',
    time: '19:00',
    startDate,
    repeatWeeks: 4,
    weekdays: [weekdayOf(startDate)],
    capacity: '',
  };
}

const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const endDateOf = (s: ScheduleState) => (s.repeatWeeks ? addDays(s.startDate, s.repeatWeeks * 7 - 1) : undefined);

/** Número de sesiones que generará esta programación. */
export function sessionCount(s: ScheduleState) {
  const end = endDateOf(s);
  return end ? countDates(s.startDate, end, s.weekdays) : 1;
}

export function scheduleIsValid(s: ScheduleState) {
  return (
    !!s.roomId && isTime(s.time) && (s.repeatWeeks === 0 || s.weekdays.length > 0) && (s.capacity === '' || parseInt(s.capacity, 10) >= 1)
  );
}

export function toScheduleBody(s: ScheduleState): ScheduleBody {
  const end = endDateOf(s);
  return {
    roomId: s.roomId,
    instructorUserId: s.instructorId || undefined,
    capacity: s.capacity ? parseInt(s.capacity, 10) : undefined,
    startTime: s.time,
    startDate: s.startDate,
    ...(end ? { endDate: end, weekdays: s.weekdays } : {}),
  };
}

export const WEEK = [
  { d: 1, l: 'L' },
  { d: 2, l: 'M' },
  { d: 3, l: 'X' },
  { d: 4, l: 'J' },
  { d: 5, l: 'V' },
  { d: 6, l: 'S' },
  { d: 0, l: 'D' },
];

/** Tira horizontal con los próximos días para elegir la fecha de inicio. */
export function DayStrip({ value, onChange, tz, days = 21 }: { value: string; onChange: (d: string) => void; tz: string; days?: number }) {
  // Se fija al montar: así el render es puro y la tira no cambia de día mientras se edita.
  const [today] = useState(() => localDateOf(Date.now(), tz));
  const list = Array.from({ length: days }, (_, i) => addDays(today, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 flex-none" contentContainerClassName="gap-2 px-5">
      {list.map((d) => {
        const on = d === value;
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            className={cn('w-[54px] items-center gap-0.5 rounded-2xl py-2.5', on ? 'bg-primary' : 'bg-card')}
          >
            <Text className={cn('text-[10.5px] font-extrabold uppercase tracking-[0.04em]', on ? 'text-white' : 'text-muted-foreground')}>
              {weekdayShort(d)}
            </Text>
            <Text className={cn('font-mono-bold text-base', on && 'text-white')}>{dayNumber(d)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type Props = {
  value: ScheduleState;
  onChange: (v: ScheduleState) => void;
  rooms: Room[];
  instructors: Instructor[];
  tz: string;
  roomTerm: string;
  instructorTerm: string;
};

/** Campos de programación: qué espacio, quién imparte, a qué hora, desde cuándo y cuánto se repite. */
export function ScheduleFields({ value, onChange, rooms, instructors, tz, roomTerm, instructorTerm }: Props) {
  const set = (p: Partial<ScheduleState>) => onChange({ ...value, ...p });
  const room = rooms.find((r) => r.id === value.roomId);

  return (
    <>
      <FormGroup label={roomTerm.toUpperCase()}>
        <View className="flex-row flex-wrap gap-2">
          {rooms.map((r) => (
            <Chip key={r.id} label={`${r.name} · ${r.capacity}`} selected={value.roomId === r.id} onPress={() => set({ roomId: r.id })} />
          ))}
        </View>
      </FormGroup>

      <FormGroup label={instructorTerm.toUpperCase()}>
        <View className="flex-row flex-wrap gap-2">
          {instructors.map((i) => (
            <Chip
              key={i.userId}
              label={i.name}
              selected={value.instructorId === i.userId}
              onPress={() => set({ instructorId: i.userId })}
            />
          ))}
        </View>
      </FormGroup>

      <FormGroup label="DÍA DE INICIO">
        <DayStrip
          value={value.startDate}
          tz={tz}
          onChange={(startDate) =>
            set({
              startDate,
              weekdays: value.repeatWeeks ? Array.from(new Set([...value.weekdays, weekdayOf(startDate)])) : [weekdayOf(startDate)],
            })
          }
        />
      </FormGroup>

      <View className="flex-row gap-2.5">
        <TimeField label="Hora de inicio" value={value.time} onChange={(time) => set({ time })} containerClassName="flex-1" />
        <Field
          label={room ? `Cupo (máx. ${room.capacity})` : 'Cupo'}
          value={value.capacity}
          onChangeText={(capacity) => set({ capacity: capacity.replace(/\D/g, '') })}
          placeholder={room ? String(room.capacity) : ''}
          keyboardType="number-pad"
          containerClassName="flex-1"
          maxLength={5}
        />
      </View>

      <FormGroup label="REPETIR">
        <View className="flex-row flex-wrap gap-2">
          {([0, 4, 8, 12] as const).map((w) => (
            <Chip
              key={w}
              label={w === 0 ? 'Solo una vez' : `${w} semanas`}
              selected={value.repeatWeeks === w}
              onPress={() => set({ repeatWeeks: w })}
            />
          ))}
        </View>
      </FormGroup>

      {value.repeatWeeks ? (
        <View className="flex-row gap-[5px]">
          {WEEK.map((w) => {
            const on = value.weekdays.includes(w.d);
            return (
              <Pressable
                key={w.d}
                onPress={() => set({ weekdays: on ? value.weekdays.filter((x) => x !== w.d) : [...value.weekdays, w.d] })}
                className={cn('h-10 flex-1 items-center justify-center rounded-xl', on ? 'bg-primary' : 'bg-card')}
              >
                <Text className={cn('text-[13.5px] font-extrabold', on ? 'text-white' : 'text-muted-foreground')}>{w.l}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}
