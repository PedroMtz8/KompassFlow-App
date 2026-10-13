import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { CalendarX, ChevronRight, CircleCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Gradient } from '@/components/ui/gradient';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { SectionDivider } from '@/components/ui/section-divider';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { canCheckIn, inProgress } from '@/features/bookings/checkin-rules';
import { LoadMore } from '@/components/load-more';
import { useMyMembership } from '@/features/payments/queries';
import { useCheckIn, useMyBookings, useMyWaitlist, type MyBooking } from '@/features/bookings/queries';
import { cardToneFor } from '@/features/session/switch-space-screen';
import { done } from '@/lib/simulate';
import { formatTime, localDateOf, longDate, relativeDay } from '@/lib/dates';
import { clock, deviceTimeZone, differsFromDevice, gmtLabel } from '@/lib/timezone';
import { useTheme } from '@/lib/theme';
import { useIsDesktop } from '@/lib/use-layout';
import { useNow } from '@/lib/use-now';

const mapsOf = (b: MyBooking) =>
  b.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address ?? b.organizationName)}`;

function NextCard({ b, now }: { b: MyBooking; now: number }) {
  const checkIn = useCheckIn();
  const live = inProgress(b, now);
  const start = +new Date(b.startsAt);
  const hours = Math.max(0, Math.round((start - now) / 3600_000));
  const when =
    hours < 1
      ? 'EN MENOS DE 1 H'
      : hours < 24
        ? `EN ${hours} H`
        : `EN ${Math.round(hours / 24)} ${Math.round(hours / 24) === 1 ? 'DÍA' : 'DÍAS'}`;
  return (
    <Gradient tone={cardToneFor(b.organizationId)} style={{ borderRadius: 26, padding: 15, gap: 12 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-extrabold tracking-[0.08em] text-white">{live ? 'EN CURSO' : `PRÓXIMA · ${when}`}</Text>
        <View className="rounded-lg bg-white/[0.22] px-2 py-1.5">
          <Text className="font-mono-bold text-xs text-white">RES-{b.id.replace(/-/g, '').slice(0, 5).toUpperCase()}</Text>
        </View>
      </View>
      <View className="gap-[3px]">
        <View className="flex-row items-center gap-2">
          <Avatar uri={b.organizationLogo} name={b.organizationName} size={28} radius={9} />
          <Text className="flex-1 text-[14px] font-extrabold text-white" numberOfLines={1}>
            {b.organizationName}
          </Text>
        </View>
        <Text className="text-[19px] font-extrabold text-white">{b.serviceName}</Text>
        <Text className="text-[13px] text-white/90">
          {relativeDay(start, b.timezone)} · {formatTime(start, b.timezone)}
          {b.roomName ? ` · ${b.roomName}` : ''}
        </Text>
        {differsFromDevice(b.timezone, start) ? (
          <Text className="text-[11.5px] text-white/85">
            Hora de la academia ({gmtLabel(b.timezone, start)}) · en tu zona: {clock(start, deviceTimeZone())}
          </Text>
        ) : null}
      </View>
      {b.checkedInAt ? (
        <View className="flex-row items-center gap-2 rounded-[12px] bg-white/[0.22] px-3 py-2">
          <CircleCheck size={16} color="#fff" />
          <Text className="flex-1 text-[12.5px] font-bold text-white">
            {b.attendance === 'PRESENT' ? 'Asistencia confirmada' : 'Avisaste que llegaste · la academia lo confirmará'}
          </Text>
        </View>
      ) : canCheckIn(b, now) ? (
        <Pressable
          onPress={() => checkIn.mutate(b.id, { onSuccess: () => done('Listo, avisamos a la academia'), onError: (e) => done(e.message) })}
          disabled={checkIn.isPending}
          className="items-center rounded-[13px] bg-white py-3 active:opacity-80"
        >
          <Text className="text-[14px] font-extrabold text-primary-dark">{checkIn.isPending ? 'Avisando…' : 'Ya llegué'}</Text>
        </Pressable>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={() => Linking.openURL(mapsOf(b))} className="rounded-[11px] bg-white px-3 py-2 active:opacity-80">
          <Text className="text-[12.5px] font-bold text-primary-dark">Cómo llegar</Text>
        </Pressable>
        {live ? null : (
          <Pressable
            onPress={() => router.push({ pathname: '/cancel-booking', params: { bookingId: b.id } })}
            className="rounded-[11px] bg-white/[0.22] px-3 py-2 active:opacity-80"
          >
            <Text className="text-[12.5px] font-bold text-white">Cancelar</Text>
          </Pressable>
        )}
      </View>
    </Gradient>
  );
}

const CARD_GAP = 10;

/** Próximas clases en un carrusel horizontal con puntos (como las fotos de un post). Con una sola, es una tarjeta normal. */
function NextCarousel({ items, now }: { items: MyBooking[]; now: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (items.length === 1) return <NextCard b={items[0]} now={now} />;
  const step = width + CARD_GAP;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (step > CARD_GAP) setPage(Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / step))));
  };
  return (
    <View className="gap-2.5" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: CARD_GAP }}
        >
          {items.map((b) => (
            <View key={b.id} style={{ width }}>
              <NextCard b={b} now={now} />
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View className="flex-row items-center justify-center gap-1.5">
        {items.map((b, i) => (
          <View
            key={b.id}
            accessibilityLabel={`Clase ${i + 1} de ${items.length}`}
            style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? t.primary : t.subtle, opacity: i === page ? 1 : 0.45 }}
          />
        ))}
      </View>
    </View>
  );
}

/** Mis clases: próxima reserva, las siguientes e historial (en cualquier organización). */
export function MyClassesScreen() {
  const theme = useTheme();
  const now = useNow();
  const desktop = useIsDesktop();
  const upcoming = useMyBookings('upcoming');
  const past = useMyBookings('past');
  const waitlist = useMyWaitlist();
  const membership = useMyMembership();
  const passes = (membership.data?.passes ?? []).filter((p) => p.active);
  const refresh = useCallback(() => Promise.allSettled([upcoming.refetch(), past.refetch(), waitlist.refetch(), membership.refetch()]), [upcoming, past, waitlist, membership]);
  useFocusEffect(
    useCallback(() => {
      upcoming.refetch();
      past.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  // Una clase que ya empezó pero no ha terminado sale de «próximas»: se muestra como «en curso» para poder avisar la llegada.
  const live = past.data?.find((b) => inProgress(b, now));
  const pastList = (past.data ?? []).filter((b) => b !== live);
  // Clases que la academia canceló (la reserva se cancela con ellas): aviso visible hasta una semana después.
  const canceledBySchool = (past.data ?? [])
    .filter((b) => b.sessionStatus === 'CANCELED' && +new Date(b.startsAt) > now - 7 * 24 * 3600_000)
    .slice(0, 3);
  // Carrusel: la clase en curso (si hay) y las próximas, hasta 6. Las secciones por academia listan todas las reservas.
  const featured = [...(live ? [live] : []), ...(upcoming.data ?? [])].slice(0, 6);
  const next = featured[0];
  const rest = upcoming.data ?? [];
  // Una sección por academia (orden: la que tiene la clase más cercana primero), con sus pases, reservas por fecha y lista de espera.
  const sections = new Map<string, { id: string; name: string; logo: string | null; bookings: MyBooking[]; passes: typeof passes; waiting: NonNullable<typeof waitlist.data> }>();
  const sectionOf = (id: string, name: string, logo: string | null | undefined) => {
    let sec = sections.get(id);
    if (!sec) sections.set(id, (sec = { id, name, logo: logo ?? null, bookings: [], passes: [], waiting: [] }));
    return sec;
  };
  for (const b of rest) sectionOf(b.organizationId, b.organizationName, b.organizationLogo).bookings.push(b);
  for (const w of waitlist.data ?? []) sectionOf(w.organizationId, w.organizationName, w.organizationLogo).waiting.push(w);
  for (const p of passes) sectionOf(p.organizationId, p.organizationName, p.organizationLogo).passes.push(p);
  const orgSections = [...sections.values()];

  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-3 pb-10" onRefresh={refresh}>
        <View className="flex-row items-center justify-between pb-1.5 pt-1">
          <Text variant="h2">Mis clases</Text>
          <View className="flex-row items-center gap-2">
            {desktop ? <RefreshButton onPress={refresh} busy={upcoming.isFetching || past.isFetching} /> : null}
          </View>
        </View>

        <QueryStatus q={upcoming} />
        {!upcoming.isPending && !upcoming.isError && !next && !waitlist.data?.length ? (
          <View className="items-center gap-2 rounded-[22px] bg-card p-6">
            <Text className="text-base font-extrabold">Aún no tienes clases reservadas</Text>
            <Text variant="muted" className="text-center">
              Explora las clases cerca de ti y reserva tu lugar.
            </Text>
            <Pressable onPress={() => router.replace('/discover')} className="mt-1 rounded-xl bg-primary px-4 py-2.5 active:opacity-80">
              <Text className="text-[13px] font-bold text-white">Descubrir clases</Text>
            </Pressable>
          </View>
        ) : null}

        {canceledBySchool.map((b) => (
          <InfoBanner
            key={b.id}
            icon={CalendarX}
            tone="pink"
            variant="alert"
            text={`${b.organizationName} canceló «${b.serviceName}» del ${longDate(localDateOf(+new Date(b.startsAt), b.timezone))}.`}
          />
        ))}

        {featured.length ? <NextCarousel items={featured} now={now} /> : null}

        {orgSections.map((sec) => (
          <View key={sec.id} className="gap-2.5">
            <SectionDivider />
            <Pressable
              onPress={() => router.push({ pathname: '/org/[id]', params: { id: sec.id } })}
              className="flex-row items-center gap-3 active:opacity-80"
            >
              <Avatar uri={sec.logo} name={sec.name} size={48} radius={16} />
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-extrabold tracking-[-0.02em]" numberOfLines={1}>
                  {sec.name}
                </Text>
                <Text variant="muted" className="text-xs">
                  {sec.bookings.length} {sec.bookings.length === 1 ? 'reserva' : 'reservas'}
                  {sec.passes.length ? ` · ${sec.passes.length} ${sec.passes.length === 1 ? 'pase activo' : 'pases activos'}` : ''}
                </Text>
              </View>
              <ChevronRight size={16} color={theme.subtle} />
            </Pressable>

            {sec.passes.length ? (
              <Pressable onPress={() => router.push('/membership')} className="gap-2 rounded-[18px] bg-card px-3.5 py-3 active:opacity-80">
                {sec.passes.map((p) => (
                  <View key={p.id} className="flex-row items-center gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.daysLeft != null ? (
                        <Text className="text-xs text-muted-foreground">
                          vence en {p.daysLeft} {p.daysLeft === 1 ? 'día' : 'días'}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="font-mono-bold text-[13px]">
                      {p.creditsTotal == null ? 'Ilimitada' : `${p.remaining} ${p.remaining === 1 ? 'crédito' : 'créditos'}`}
                    </Text>
                  </View>
                ))}
              </Pressable>
            ) : null}

            {sec.waiting.map((w) => (
              <Pressable
                key={w.entryId}
                onPress={() => router.push({ pathname: '/class/[id]', params: { id: w.sessionId } })}
                className="flex-row items-center gap-3 rounded-[18px] bg-card px-3.5 py-3 active:opacity-90"
              >
                <View className="min-w-0 flex-1 gap-[3px]">
                  <Text className="text-sm font-bold" numberOfLines={1}>
                    {w.service}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                    {relativeDay(+new Date(w.startsAt), w.timezone)} · {formatTime(w.startsAt, w.timezone)}
                  </Text>
                  {w.status === 'OFFERED' && w.offerExpiresAt ? (
                    <Text className="text-[11.5px] font-bold text-teal">Lugar apartado hasta las {formatTime(w.offerExpiresAt, w.timezone)}: tómalo</Text>
                  ) : (
                    <Text className="text-[11.5px] text-muted-foreground">Lugar {w.position} en la fila</Text>
                  )}
                </View>
                <Badge tone={w.status === 'OFFERED' ? 'teal' : 'amber'}>{w.status === 'OFFERED' ? 'TU LUGAR' : 'EN ESPERA'}</Badge>
              </Pressable>
            ))}

            {sec.bookings.length ? (
              <View>
                {sec.bookings.map((b, i) => {
                  const day = relativeDay(+new Date(b.startsAt), b.timezone);
                  const showDay = i === 0 || relativeDay(+new Date(sec.bookings[i - 1].startsAt), b.timezone) !== day;
                  return (
                    <View key={b.id}>
                      {showDay ? (
                        <Text className="pb-1 pt-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{day}</Text>
                      ) : null}
                      <Pressable
                        onPress={() => router.push({ pathname: '/booking', params: { bookingId: b.id } })}
                        className="flex-row items-center gap-3 py-[8px] active:opacity-80"
                      >
                        <View className="h-[42px] w-[54px] items-center justify-center rounded-[14px] bg-primary-soft">
                          <Text className="font-mono-bold text-[13px] text-primary-dark">{formatTime(b.startsAt, b.timezone)}</Text>
                        </View>
                        <View className="min-w-0 flex-1 gap-[3px]">
                          <Text className="text-sm font-bold" numberOfLines={1}>
                            {b.serviceName}
                          </Text>
                          {b.roomName ? (
                            <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                              {b.roomName}
                            </Text>
                          ) : null}
                        </View>
                        <Badge tone="teal">RESERVADA</Badge>
                      </Pressable>
                      {i < sec.bookings.length - 1 ? <ListDivider /> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))}
        <LoadMore q={upcoming} label="Ver más reservas próximas" />

        {pastList.length ? (
          <>
            <SectionDivider />
            <SectionHeader title="Historial" className="pt-0.5" />
            <Text variant="muted" className="-mt-1 text-xs">
              «Sin registro» = la academia aún no pasó lista de esa clase. Toca una clase para ver su detalle; si sí fuiste, ahí puedes avisarlo.
            </Text>
            <View className="-mt-1.5">
              {pastList.map((b, i) => (
                <View key={b.id}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/booking', params: { bookingId: b.id } })}
                    className="flex-row items-center gap-3 py-[9px] active:opacity-80"
                  >
                    <Avatar uri={b.organizationLogo} name={b.organizationName} size={38} radius={12} />
                    <View className="min-w-0 flex-1 gap-[3px]">
                      <Text className="text-sm font-bold" numberOfLines={1}>
                        {b.serviceName}
                      </Text>
                      <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                        <Text className="text-[11.5px] font-bold text-foreground">{b.organizationName}</Text> · {longDate(localDateOf(+new Date(b.startsAt), b.timezone))}
                      </Text>
                    </View>
                    <Badge
                      tone={
                        b.status === 'CANCELED' || b.sessionStatus === 'CANCELED'
                          ? b.sessionStatus === 'CANCELED'
                            ? 'pink'
                            : 'ink'
                          : b.attendance === 'PRESENT'
                            ? 'teal'
                            : b.checkedInAt
                              ? 'violet'
                              : b.attendance === 'ABSENT'
                              ? 'pink'
                              : 'amber'
                      }
                    >
                      {b.sessionStatus === 'CANCELED'
                        ? 'SE CANCELÓ'
                        : b.status === 'CANCELED'
                          ? 'CANCELADA'
                          : b.attendance === 'PRESENT'
                            ? 'ASISTIÓ'
                            : b.checkedInAt
                              ? 'EN REVISIÓN'
                              : b.attendance === 'ABSENT'
                              ? 'FALTÓ'
                              : 'SIN REGISTRO'}
                    </Badge>
                    <ChevronRight size={16} color={theme.subtle} />
                  </Pressable>
                  {i < pastList.length - 1 ? <ListDivider /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
        <LoadMore q={past} label="Ver más historial" />
      </ScreenScroll>
    </Screen>
  );
}
