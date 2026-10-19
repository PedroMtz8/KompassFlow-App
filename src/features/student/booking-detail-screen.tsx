import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CalendarX from 'lucide-react-native/icons/calendar-x';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleHelp from 'lucide-react-native/icons/circle-question-mark';
import CircleX from 'lucide-react-native/icons/circle-x';
import Hourglass from 'lucide-react-native/icons/hourglass';
import Navigation from 'lucide-react-native/icons/navigation';
import { Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { canCheckIn, canClaim, inProgress } from '@/features/bookings/checkin-rules';
import { useCheckIn, useMyBooking, type MyBooking } from '@/features/bookings/queries';
import { formatTime, localDateOf, longDate } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { useTheme } from '@/lib/theme';
import { clock, deviceTimeZone, differsFromDevice, gmtLabel } from '@/lib/timezone';
import { useNow } from '@/lib/use-now';

const mapsOf = (b: MyBooking) =>
  b.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address ?? b.organizationName)}`;

/** Qué le pasó a esta reserva, dicho en claro para el alumno. */
function statusOf(b: MyBooking, now: number) {
  const ended = now > +new Date(b.endsAt);
  if (b.sessionStatus === 'CANCELED') return { icon: CalendarX, tone: 'pink' as const, label: 'SE CANCELÓ', text: `${b.organizationName} canceló esta clase.` };
  if (b.status === 'CANCELED') return { icon: CalendarX, tone: 'ink' as const, label: 'CANCELADA', text: 'Cancelaste esta reserva.' };
  if (b.attendance === 'PRESENT') return { icon: CircleCheck, tone: 'teal' as const, label: 'ASISTIÓ', text: 'Tu asistencia quedó registrada.' };
  if (b.checkedInAt && ended)
    return { icon: Hourglass, tone: 'violet' as const, label: 'EN REVISIÓN', text: 'Avisaste que sí asististe. La academia lo está revisando.' };
  if (b.checkedInAt) return { icon: Hourglass, tone: 'teal' as const, label: 'LLEGASTE', text: 'Avisaste que llegaste. La academia lo confirmará.' };
  if (!ended)
    return inProgress(b, now)
      ? { icon: CalendarClock, tone: 'teal' as const, label: 'EN CURSO', text: 'La clase está en curso.' }
      : { icon: CalendarClock, tone: 'teal' as const, label: 'RESERVADA', text: 'Tu lugar está reservado.' };
  if (b.attendance === 'ABSENT') return { icon: CircleX, tone: 'pink' as const, label: 'FALTÓ', text: 'La academia te registró falta en esta clase.' };
  return { icon: CircleHelp, tone: 'amber' as const, label: 'SIN REGISTRO', text: 'La academia aún no pasó lista de esta clase.' };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-2.5">
      <Text variant="muted" className="text-[13px]">
        {label}
      </Text>
      <Text className="flex-1 text-right text-[13px] font-bold">{value}</Text>
    </View>
  );
}

/** Detalle de una reserva (próxima o pasada): datos de la clase, estado de la asistencia y lo que el alumno puede hacer. */
export function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const theme = useTheme();
  const now = useNow();
  const q = useMyBooking(bookingId);
  const checkIn = useCheckIn();
  const b = q.data;

  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Detalle de la clase" />
      </Screen>
    );
  }
  if (!b) {
    if (q.isError) return <ErrorNotice fill what="la clase" busy={q.isFetching} onRetry={q.refetch} />;
    return (
      <Screen>
        <ScreenHeader title="Detalle de la clase" />
        <ScreenScroll>
          <Text variant="muted">No encontramos esta reserva.</Text>
        </ScreenScroll>
      </Screen>
    );
  }

  const start = +new Date(b.startsAt);
  const end = +new Date(b.endsAt);
  const st = statusOf(b, now);
  const cancellable =
    b.status === 'CONFIRMED' && b.sessionStatus === 'SCHEDULED' && start > now;
  const arrive = canCheckIn(b, now);
  const claim = canClaim(b, now);

  const send = (okMsg: string) =>
    checkIn.mutate(b.id, { onSuccess: () => done(okMsg), onError: (e) => done(e.message) });

  return (
    <Screen>
      <ScreenHeader title="Detalle de la clase" subtitle={b.organizationName} />
      <ScreenScroll contentContainerClassName="gap-3 pb-6">
        <View className="gap-3 rounded-[22px] bg-card p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-lg font-extrabold">{b.serviceName}</Text>
              <Text variant="muted" className="text-[13px]">
                {longDate(localDateOf(start, b.timezone))} · {formatTime(start, b.timezone)}
              </Text>
            </View>
            <Badge tone={st.tone}>{st.label}</Badge>
          </View>
          {differsFromDevice(b.timezone, start) ? (
            <Text variant="muted" className="text-[11.5px]">
              Hora de la academia ({gmtLabel(b.timezone, start)}) · en tu zona: {clock(start, deviceTimeZone())}
            </Text>
          ) : null}
        </View>

        <InfoBanner icon={st.icon} tone={st.tone} text={st.text} />

        {claim ? (
          <Text variant="muted" className="px-1 text-xs">
            Si sí fuiste a esta clase, avísalo. La academia lo revisa y, si lo confirma, quedará como asistencia. Puedes hacerlo hasta 7 días después de la clase.
          </Text>
        ) : null}

        <View className="rounded-[22px] bg-card px-4 py-1.5">
          <Row label="Academia" value={b.organizationName} />
          <ListDivider />
          <Row label="Horario" value={`${formatTime(start, b.timezone)} – ${formatTime(end, b.timezone)}`} />
          {b.roomName ? (
            <>
              <ListDivider />
              <Row label="Salón" value={b.roomName} />
            </>
          ) : null}
          {b.address ? (
            <>
              <ListDivider />
              <Row label="Dirección" value={[b.address, b.neighborhood].filter(Boolean).join(', ')} />
            </>
          ) : null}
          <ListDivider />
          <Row label="Reserva" value={`RES-${b.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`} />
        </View>

        <Pressable
          onPress={() => Linking.openURL(mapsOf(b))}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-card py-3 active:opacity-80"
        >
          <Icon as={Navigation} size={16} color={theme.primary} />
          <Text className="text-[13.5px] font-bold text-primary-dark">Cómo llegar</Text>
        </Pressable>

        {cancellable ? (
          <Pressable onPress={() => router.push({ pathname: '/cancel-booking', params: { bookingId: b.id } })} className="items-center py-2">
            <Text className="text-[13px] font-bold text-destructive">Cancelar reserva</Text>
          </Pressable>
        ) : null}
      </ScreenScroll>

      {arrive || claim ? (
        <FooterBar>
          <Button
            size="lg"
            loading={checkIn.isPending}
            onPress={() => send(arrive ? 'Listo, avisamos a la academia' : 'Listo, la academia revisará tu asistencia')}
          >
            <Text className="text-[15.5px]">{arrive ? 'Ya llegué' : 'Sí asistí'}</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}
