import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { TimeZoneNote } from '@/components/timezone';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Gradient } from '@/components/ui/gradient';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useBookSlot, usePrivateSlots } from '@/features/bookings/queries';
import { asDateString, formatMoney, formatTime, longDate, weekdayShort } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { cn } from '@/lib/utils';

/** Reservar una clase privada: se elige día y horario entre los que la persona que la imparte tiene libres. */
export function PrivateClassScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const q = usePrivateSlots(serviceId);
  const book = useBookSlot(serviceId ?? '');
  const [day, setDay] = useState<string>();
  const [slot, setSlot] = useState<number>();

  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Clase privada" />
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }
  const d = q.data;
  if (q.isError) return <ErrorNotice fill what="los horarios" busy={q.isFetching} onRetry={q.refetch} />;
  if (!d) {
    return (
      <Screen>
        <ScreenHeader title="Clase privada" />
        <ScreenScroll>
          <Text variant="muted">Esta clase privada no está disponible.</Text>
        </ScreenScroll>
      </Screen>
    );
  }

  // El cliente convierte los textos con forma de fecha en `Date`; se vuelve a "YYYY-MM-DD".
  const days = d.days.map((x) => ({ ...x, date: asDateString(x.date) }));
  const current = days.find((x) => x.date === day) ?? days[0];
  const chosen = slot && current?.slots.includes(slot) ? slot : undefined;

  const submit = () => {
    if (!chosen) return;
    book.mutate(chosen, {
      onSuccess: (r) => router.replace({ pathname: '/confirmation', params: { sessionId: r.sessionId, bookingId: r.bookingId } }),
      onError: (e) => {
        done(e.message);
        q.refetch();
        setSlot(undefined);
      },
    });
  };

  return (
    <Screen>
      <ScreenHeader
        title={d.service.name}
        subtitle={`${d.service.durationMin} min · ${formatMoney(d.service.priceCents, d.service.currency)}`}
      />
      <ScreenScroll contentContainerClassName="gap-3">
        {days.length === 0 ? (
          <View className="items-center gap-1 rounded-[20px] bg-card p-5">
            <Text className="text-sm font-bold">Sin horarios disponibles</Text>
            <Text variant="muted" className="text-center">
              No hay horarios libres en los próximos 14 días. Vuelve a revisar pronto.
            </Text>
          </View>
        ) : (
          <>
            <Text variant="overline">DÍA</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {days.map((x) => {
                const selected = x.date === current.date;
                const inner = (
                  <>
                    <Text
                      className={cn('text-[10.5px] font-extrabold tracking-[0.05em]', selected ? 'text-white' : 'text-muted-foreground')}
                    >
                      {weekdayShort(x.date).toUpperCase()}
                    </Text>
                    <Text className={cn('font-mono-bold text-[17px] leading-[17px]', selected && 'text-white')}>
                      {Number(x.date.slice(8))}
                    </Text>
                  </>
                );
                return (
                  <Pressable key={x.date} onPress={() => setDay(x.date)} className="w-[52px] overflow-hidden rounded-2xl">
                    {selected ? (
                      <Gradient tone="orange" style={{ alignItems: 'center', gap: 3, paddingVertical: 9 }}>
                        {inner}
                      </Gradient>
                    ) : (
                      <View className="items-center gap-[3px] bg-card py-[9px]">{inner}</View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text variant="overline">{longDate(current.date).toUpperCase()}</Text>
            <View className="flex-row flex-wrap gap-2">
              {current.slots.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSlot(s)}
                  className={cn('h-11 w-[31.5%] items-center justify-center rounded-[14px]', chosen === s ? 'bg-ink' : 'bg-card')}
                >
                  <Text className={cn('font-mono-bold text-sm', chosen === s && 'text-white')}>{formatTime(s, d.timezone)}</Text>
                </Pressable>
              ))}
            </View>
            {chosen ? <TimeZoneNote at={chosen} tz={d.timezone} /> : null}
          </>
        )}
      </ScreenScroll>
      <FooterBar>
        <Button size="lg" disabled={!chosen || book.isPending} onPress={submit}>
          <Text className="text-[15.5px]">
            {book.isPending
              ? 'Reservando…'
              : chosen
                ? `Reservar ${formatTime(chosen, d.timezone)} · ${formatMoney(d.service.priceCents, d.service.currency)}`
                : 'Elige un horario'}
          </Text>
        </Button>
      </FooterBar>
    </Screen>
  );
}
