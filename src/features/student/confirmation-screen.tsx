import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import CalendarPlus from 'lucide-react-native/icons/calendar-plus';
import Check from 'lucide-react-native/icons/check';
import Navigation from 'lucide-react-native/icons/navigation';
import { ActivityIndicator, View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useDiscoverSession } from '@/features/bookings/queries';
import { toneFor } from '@/features/session/switch-space-screen';
import { TimeZoneNote } from '@/components/timezone';
import { formatTime, localDateOf, longDate, weekdayShort } from '@/lib/dates';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-[3px]">
      <Text className="text-[11px] font-bold text-subtle">{label}</Text>
      <Text className="text-[14.5px] font-extrabold" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Confirmación de reserva con código de entrada. */
export function ConfirmationScreen() {
  const { sessionId, bookingId } = useLocalSearchParams<{ sessionId?: string; bookingId?: string }>();
  const q = useDiscoverSession(sessionId);
  const s = q.data;
  if (!s) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  const start = +new Date(s.startsAt);
  const date = localDateOf(start, s.timezone);
  const code = `RES-${(bookingId ?? '').replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  const maps = s.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address ?? ''}, ${s.city ?? ''}`)}`;

  return (
    <Screen>
      <ScreenScroll contentContainerClassName="items-center gap-[18px] px-1 pt-4">
        <Gradient tone="orange" style={{ width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Check} size={44} color="#fff" strokeWidth={3} />
        </Gradient>
        <View className="items-center gap-1.5">
          <Text className="text-[27px] font-extrabold tracking-[-0.03em]">¡Lugar reservado!</Text>
          <Text className="text-center text-[14.5px] text-muted-foreground">
            Te esperamos el {longDate(date)}. Cancela hasta {s.cancelWindowHours} h antes.
          </Text>
        </View>

        <View className="w-full overflow-hidden rounded-[26px] bg-card border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
          <Gradient tone={toneFor(s.organizationId)} style={{ height: 72, justifyContent: 'center', paddingHorizontal: 16 }}>
            <Badge appearance="white" tone="teal">
              Confirmada
            </Badge>
          </Gradient>
          <View className="gap-3 p-4">
            <View className="gap-[3px]">
              <Text className="text-[17px] font-extrabold">{s.serviceName}</Text>
              <Text variant="muted">{[s.organizationName, s.instructorName].filter(Boolean).join(' · ')}</Text>
            </View>
            <View className="flex-row gap-2">
              <Detail label="Fecha" value={`${weekdayShort(date)} ${date.slice(8).replace(/^0/, '')}`} />
              <Detail label="Hora" value={formatTime(start, s.timezone)} />
              <Detail label="Lugar" value={s.roomName ?? s.address ?? '—'} />
            </View>
            <TimeZoneNote at={start} tz={s.timezone} />
            <View className="flex-row items-center justify-between border-t-[1.5px] border-dashed border-[#E6DDE8] pt-3">
              <View className="gap-[3px]">
                <Text className="text-[11px] font-bold text-subtle">Código de reserva</Text>
                <Text className="font-mono-bold text-[22px] leading-[22px] tracking-[0.06em] text-primary">{code}</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="w-full flex-row gap-2.5">
          <Button variant="secondary" className="h-[52px] flex-1 rounded-2xl" onPress={() => router.replace('/my-classes')}>
            <Icon as={CalendarPlus} size={17} />
            <Text className="text-sm font-bold text-foreground">Mis clases</Text>
          </Button>
          <Button variant="secondary" className="h-[52px] flex-1 rounded-2xl" onPress={() => Linking.openURL(maps)}>
            <Icon as={Navigation} size={17} />
            <Text className="text-sm font-bold text-foreground">Cómo llegar</Text>
          </Button>
        </View>
      </ScreenScroll>
      <FooterBar>
        <Button variant="dark" size="lg" onPress={() => router.replace('/discover')}>
          <Text className="text-[15.5px]">Seguir explorando</Text>
        </Button>
      </FooterBar>
    </Screen>
  );
}
