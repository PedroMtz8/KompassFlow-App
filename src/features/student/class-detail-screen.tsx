import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import DoorOpen from 'lucide-react-native/icons/door-open';
import MapPin from 'lucide-react-native/icons/map-pin';
import Navigation from 'lucide-react-native/icons/navigation';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Ticket from 'lucide-react-native/icons/ticket';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient } from '@/components/ui/gradient';
import { Photo } from '@/components/ui/photo';
import { GlassButton } from '@/components/ui/hero-photo';
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { InfoBanner } from '@/components/ui/info-banner';
import { TintedInfo } from '@/components/ui/tinted-info';
import { useDiscoverSession, useWaitlistActions } from '@/features/bookings/queries';
import { kindLabel, levelLabel } from '@/features/classes/class-labels';
import { toneFor } from '@/features/session/switch-space-screen';
import { passNote } from '@/features/student/pass-note';
import { TimeZoneNote } from '@/components/timezone';
import { formatMoney, formatTime, localDateOf, longDate } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { goBack } from '@/lib/nav';
import { useNow } from '@/lib/use-now';
import { useTones } from '@/lib/tones';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Detalle de una sesión: cupo en vivo, lugar, política de cancelación y botón de reserva. */
export function ClassDetailScreen() {
  const theme = useTheme();
  const tones = useTones();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDiscoverSession(id);
  const insets = useSafeAreaInsets();
  const now = useNow();
  const wl = useWaitlistActions();
  const s = q.data;

  if (q.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (q.isError) return <ErrorNotice fill what="la clase" busy={q.isFetching} onRetry={q.refetch} />;
  if (!s) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-base font-extrabold">Esta clase ya no está disponible</Text>
        <Button variant="secondary" onPress={goBack}>
          <Text>Volver</Text>
        </Button>
      </View>
    );
  }

  const tone = toneFor(s.organizationId);
  const t = tones[tone];
  const start = +new Date(s.startsAt);
  const date = localDateOf(start, s.timezone);
  const maps =
    s.mapsUrl ??
    (s.lat != null && s.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address ?? ''}, ${s.city ?? ''}`)}`);
  const closed = s.status !== 'SCHEDULED' || start <= now;
  const full = s.left === 0;
  const note = passNote(s.pass);
  const w = s.waitlist;
  const offered = w?.status === 'OFFERED';
  const waiting = w?.status === 'WAITING';
  const until = offered && w.offerExpiresAt ? formatTime(w.offerExpiresAt, s.timezone) : null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <View style={{ height: 170 }}>
          {s.coverImage ? (
            <Photo uri={s.coverImage} height={170} style={{ position: 'absolute', inset: 0 }} />
          ) : (
            <Gradient tone={tone} style={{ position: 'absolute', inset: 0 }} />
          )}
          <LinearGradient
            colors={['rgba(27,22,32,0.45)', 'rgba(27,22,32,0)', 'rgba(255,247,241,0.95)']}
            locations={[0, 0.5, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View className="mx-auto w-full max-w-[480px] px-5 md:max-w-[680px]" style={{ paddingTop: insets.top + 4 }}>
            <GlassButton onPress={goBack}>
              <Icon as={ChevronLeft} size={19} />
            </GlassButton>
          </View>
        </View>
        <View className="mx-auto -mt-6 w-full max-w-[480px] gap-3.5 px-5 md:max-w-[680px]">
          <View className="gap-1.5">
            <View className="flex-row flex-wrap gap-1.5">
              {s.disciplineName ? <Badge tone={tone}>{s.disciplineName}</Badge> : null}
              <Badge tone="ink">{kindLabel[s.kind]}</Badge>
              <Badge tone="ink">{levelLabel[s.level]}</Badge>
            </View>
            <Text className="text-[25px] font-extrabold tracking-[-0.03em]">{s.serviceName}</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/org/[id]', params: { id: s.organizationId } })}
              className="flex-row items-center gap-[7px] self-start active:opacity-70"
            >
              <View className="h-5 w-5 items-center justify-center rounded-[7px]" style={{ backgroundColor: t.soft }}>
                <Text className="text-[9px] font-extrabold" style={{ color: t.deep }}>
                  {initialsOf(s.organizationName)}
                </Text>
              </View>
              <Text className="text-[13.5px] font-semibold text-muted-foreground">{s.organizationName}</Text>
              <Icon as={ChevronRight} size={14} color="#9A93A0" />
            </Pressable>
          </View>

          {s.description ? <Text className="text-[13.5px] leading-5 text-muted-foreground">{s.description}</Text> : null}

          <View className="flex-row gap-[9px]">
            <TintedInfo
              icon={CalendarDays}
              tone="orange"
              title={
                longDate(date)
                  .replace(/^./, (c) => c.toUpperCase())
                  .split(',')[0] +
                ' ' +
                date.slice(8).replace(/^0/, '')
              }
              note={`${formatTime(start, s.timezone)}–${formatTime(s.endsAt, s.timezone)}`}
            />
            <TintedInfo icon={DoorOpen} tone="violet" title={s.roomName ?? 'Por confirmar'} note={s.neighborhood ?? s.city ?? ''} />
            <TintedInfo icon={Clock} tone="teal" title={`${s.durationMin} min`} note={kindLabel[s.kind]} />
          </View>
          <TimeZoneNote at={start} tz={s.timezone} />

          <View className="gap-2.5 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-sm font-bold">Cupo</Text>
              <Text className="text-[13px] text-muted-foreground">
                <Text className="font-mono-bold text-[22px]" style={{ color: t.solid }}>
                  {s.left}
                </Text>{' '}
                de {s.capacity} lugares
              </Text>
            </View>
            <ProgressBar value={s.capacity ? s.booked / s.capacity : 0} tone={tone} height={10} />
          </View>

          {s.instructorName ? (
            <View className="flex-row items-center gap-[11px]">
              <Avatar name={s.instructorName} size={42} />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold">{s.instructorName}</Text>
                <Text className="text-xs text-muted-foreground">Imparte esta sesión</Text>
              </View>
            </View>
          ) : null}

          {s.address ? (
            <View className="flex-row items-center gap-[11px] rounded-[22px] bg-card p-3 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
              <View className="h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-primary-soft">
                <Icon as={MapPin} size={19} color={theme.primary} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-[13.5px] font-bold">{s.address}</Text>
                <Text className="text-xs text-muted-foreground">{[s.neighborhood, s.city].filter(Boolean).join(', ')}</Text>
              </View>
              <Pressable
                onPress={() => Linking.openURL(maps)}
                className="flex-row items-center gap-[5px] rounded-[11px] bg-muted px-[11px] py-[9px] active:opacity-70"
              >
                <Icon as={Navigation} size={14} />
                <Text className="text-[12.5px] font-bold">Maps</Text>
              </Pressable>
            </View>
          ) : null}

          {offered && !closed ? (
            <InfoBanner icon={Ticket} tone="teal" variant="alert" text={`Se liberó un lugar y es tuyo hasta las ${until}. Tómalo antes de que pase al siguiente.`} />
          ) : null}
          {waiting && !closed ? (
            <InfoBanner
              icon={Clock}
              tone="amber"
              variant="alert"
              text={`Estás en la lista de espera: lugar ${w.position} de ${w.count}. Te avisamos si se libera uno.`}
            />
          ) : null}
          {note && !s.mineBookingId && (!full || offered) ? <InfoBanner icon={Ticket} tone={note.covered ? 'teal' : 'amber'} text={note.text} /> : null}

          <View className="flex-row items-center gap-1.5">
            <Icon as={ShieldCheck} size={14} color="#6B6270" />
            <Text variant="muted" className="text-xs">
              Cancela sin costo hasta {s.cancelWindowHours} h antes.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-ink/[0.07] bg-card" style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}>
        <View className="mx-auto w-full max-w-[480px] flex-row items-center gap-3.5 px-5 pt-3.5 md:max-w-[680px]">
          <View className="gap-[3px]">
            <Text className="font-mono-bold text-[21px] leading-[21px]">
              {s.priceCents ? formatMoney(s.priceCents, s.currency) : 'Gratis'}
            </Text>
            <Text className="text-[11.5px] font-semibold text-muted-foreground">
              {note?.covered ? 'Con tu paquete' : 'Se paga en el lugar'}
            </Text>
          </View>
          {s.mineBookingId ? (
            <Button size="lg" variant="dark" className="flex-1" onPress={() => router.replace('/my-classes')}>
              <Text className="text-[15.5px]">Ya tienes tu lugar · Ver</Text>
            </Button>
          ) : closed ? (
            <Button size="lg" className="flex-1" disabled>
              <Text className="text-[15.5px]">No disponible</Text>
            </Button>
          ) : offered ? (
            <View className="flex-1 gap-2">
              <Button size="lg" onPress={() => router.push({ pathname: '/checkout', params: { sessionId: s.id } })}>
                <Text className="text-[15.5px]">Tomar mi lugar</Text>
              </Button>
              <Pressable
                onPress={() => wl.leave.mutate(s.id, { onSuccess: () => done('Listo: el lugar pasa al siguiente'), onError: (e) => done(e.message) })}
                hitSlop={8}
                className="items-center active:opacity-70"
              >
                <Text className="text-[12.5px] font-bold text-muted-foreground">No lo quiero</Text>
              </Pressable>
            </View>
          ) : full ? (
            waiting ? (
              <Button
                size="lg"
                variant="secondary"
                className="flex-1"
                disabled={wl.leave.isPending}
                onPress={() => wl.leave.mutate(s.id, { onSuccess: () => done('Saliste de la lista de espera'), onError: (e) => done(e.message) })}
              >
                <Text className="text-[15.5px]">Salir de la lista</Text>
              </Button>
            ) : (
              <Button
                size="lg"
                variant="dark"
                className="flex-1"
                disabled={wl.join.isPending}
                onPress={() => wl.join.mutate(s.id, { onSuccess: () => done('Estás en la lista de espera'), onError: (e) => done(e.message) })}
              >
                <Text className="text-[15.5px]">{wl.join.isPending ? 'Entrando…' : 'Unirme a la lista de espera'}</Text>
              </Button>
            )
          ) : (
            <Button size="lg" className="flex-1" onPress={() => router.push({ pathname: '/checkout', params: { sessionId: s.id } })}>
              <Text className="text-[15.5px]">Reservar lugar</Text>
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
