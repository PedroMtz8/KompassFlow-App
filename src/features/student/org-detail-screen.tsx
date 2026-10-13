import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronLeft, Clock, Globe, MapPin, Navigation, Phone, Users } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { PlacesMap } from '@/components/map/places-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gradient } from '@/components/ui/gradient';
import { GlassButton } from '@/components/ui/hero-photo';
import { Icon } from '@/components/ui/icon';
import { Photo } from '@/components/ui/photo';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useDiscoverOrg } from '@/features/bookings/queries';
import { usePublicProducts } from '@/features/payments/queries';
import { kindLabel, levelLabel } from '@/features/classes/class-labels';
import { toneFor } from '@/features/session/switch-space-screen';
import { formatMoney, formatTime, localDateOf, longDate } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { distanceKm, formatDistance, useLocation } from '@/stores/location';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const COL = 'mx-auto w-full max-w-[480px] px-5 md:max-w-[680px]';

/** Perfil público de una academia: quién es, dónde está, qué ofrece y qué horarios tiene. */
export function OrgDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDiscoverOrg(id);
  const pubProducts = usePublicProducts(id);
  const insets = useSafeAreaInsets();
  const loc = useLocation();
  const o = q.data;

  if (q.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (q.isError) return <ErrorNotice fill what="la academia" busy={q.isFetching} onRetry={q.refetch} />;
  if (!o?.id) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-base font-extrabold">Esta academia ya no está disponible</Text>
        <Button variant="secondary" onPress={goBack}>
          <Text>Volver</Text>
        </Button>
      </View>
    );
  }

  const tone = toneFor(o.id);
  const hasCoords = o.lat != null && o.lng != null;
  const km = hasCoords && loc.coords ? distanceKm(loc.coords, { lat: o.lat!, lng: o.lng! }) : null;
  const maps =
    o.mapsUrl ??
    (hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address ?? ''}, ${o.city ?? ''}`)}`);
  const instagram = o.instagram ? `https://instagram.com/${o.instagram.replace(/^@/, '')}` : null;
  const website = o.website ? (/^https?:\/\//.test(o.website) ? o.website : `https://${o.website}`) : null;

  // Próximas sesiones agrupadas por día local de la academia.
  const days = new Map<string, typeof o.sessions>();
  for (const s of o.sessions) {
    const d = localDateOf(+new Date(s.startsAt), o.timezone);
    days.set(d, [...(days.get(d) ?? []), s]);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-12">
        <View style={{ height: 230 }}>
          {o.coverImage ? (
            <Photo uri={o.coverImage} height={230} style={{ position: 'absolute', inset: 0 }} />
          ) : (
            <Gradient tone={tone} style={{ position: 'absolute', inset: 0 }} />
          )}
          <LinearGradient
            colors={['rgba(27,22,32,0.5)', 'rgba(27,22,32,0)', 'rgba(255,247,241,0.95)']}
            locations={[0, 0.45, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View className={COL} style={{ paddingTop: insets.top + 4 }}>
            <GlassButton onPress={goBack}>
              <Icon as={ChevronLeft} size={19} />
            </GlassButton>
          </View>
        </View>

        <View className={cn(COL, '-mt-11 gap-4')}>
          <View className="flex-row items-end gap-3">
            <View
              className="h-[78px] w-[78px] items-center justify-center rounded-[24px] border-4 border-background"
              style={{ overflow: 'hidden' }}
            >
              {o.logo ? (
                <Photo uri={o.logo} width={78} height={78} radius={0} />
              ) : (
                <Gradient tone={tone} style={{ width: 78, height: 78, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-2xl font-extrabold text-white">{initialsOf(o.name)}</Text>
                </Gradient>
              )}
            </View>
            <View className="min-w-0 flex-1 gap-1 pb-1">
              <Text className="text-[23px] font-extrabold tracking-[-0.025em]" numberOfLines={2}>
                {o.name}
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                {o.type === 'PERSONAL' ? 'Instructor independiente' : 'Academia'} · {o.verticalName}
                {km != null ? ` · ${formatDistance(km)}` : ''}
              </Text>
            </View>
          </View>

          {o.description ? <Text className="text-[14px] leading-[21px] text-[#4A4152]">{o.description}</Text> : null}

          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" onPress={() => Linking.openURL(maps)} className="flex-1">
              <Icon as={Navigation} size={16} color="#fff" />
              <Text className="text-[13px]">Cómo llegar</Text>
            </Button>
            {o.phone ? (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => Linking.openURL(`tel:${o.phone!.replace(/\s/g, '')}`)}
                className="flex-1"
              >
                <Icon as={Phone} size={16} />
                <Text className="text-[13px] text-foreground">Llamar</Text>
              </Button>
            ) : null}
            {instagram ? (
              <Button size="sm" variant="secondary" onPress={() => Linking.openURL(instagram)} className="flex-1">
                <Icon as={Camera} size={16} />
                <Text className="text-[13px] text-foreground">Instagram</Text>
              </Button>
            ) : null}
            {website ? (
              <Button size="sm" variant="secondary" onPress={() => Linking.openURL(website)} className="flex-1">
                <Icon as={Globe} size={16} />
                <Text className="text-[13px] text-foreground">Sitio</Text>
              </Button>
            ) : null}
          </View>

          {o.address ? (
            <View className="overflow-hidden rounded-3xl bg-card shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
              {hasCoords ? (
                <PlacesMap
                  pins={[{ id: o.id, lat: o.lat!, lng: o.lng!, title: o.name }]}
                  selectedId={o.id}
                  user={loc.coords}
                  height={170}
                  interactive={false}
                />
              ) : null}
              <View className="flex-row items-center gap-[11px] p-3">
                <View className="h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-primary-soft">
                  <Icon as={MapPin} size={19} color={t.primary} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[13.5px] font-bold">{o.address}</Text>
                  <Text className="text-xs text-muted-foreground">{[o.neighborhood, o.city].filter(Boolean).join(', ')}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {o.team.length ? (
            <View className="flex-row items-center gap-2.5 rounded-[20px] bg-card px-3.5 py-3">
              <Icon as={Users} size={17} color="#6B6270" />
              <Text className="flex-1 text-[13px] text-[#4A4152]">
                <Text className="text-[13px] font-bold">{o.terms.instructors}: </Text>
                {o.team.map((t) => t.name).join(', ')}
              </Text>
            </View>
          ) : null}

          <SectionHeader title="Lo que ofrecen" variant="title" />
          <View className="gap-2.5">
            {o.services.map((s) => (
              <View key={s.id} className="gap-1.5 rounded-[20px] bg-card p-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-[14.5px] font-bold">{s.name}</Text>
                  <Text variant="mono">{s.priceCents ? formatMoney(s.priceCents, o.currency) : 'Gratis'}</Text>
                </View>
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {s.disciplineName ? <Badge tone={tone}>{s.disciplineName}</Badge> : null}
                  <Badge tone="ink">{kindLabel[s.kind]}</Badge>
                  <Badge tone="ink">{levelLabel[s.level]}</Badge>
                  <View className="flex-row items-center gap-1 pl-1">
                    <Icon as={Clock} size={12} color="#6B6270" />
                    <Text className="text-[11.5px] text-muted-foreground">{s.durationMin} min</Text>
                  </View>
                </View>
                {s.description ? <Text className="text-xs leading-[18px] text-muted-foreground">{s.description}</Text> : null}
                {s.kind === 'PRIVATE' ? (
                  <Button size="sm" onPress={() => router.push({ pathname: '/private-class', params: { serviceId: s.id } })}>
                    <Text>Ver horarios</Text>
                  </Button>
                ) : null}
              </View>
            ))}
          </View>

          {pubProducts.data?.products.length ? (
            <>
              <SectionHeader title="Paquetes y precios" variant="title" />
              <View className="gap-2.5">
                {pubProducts.data.products.map((p) => (
                  <View key={p.id} className="gap-1.5 rounded-[20px] bg-card p-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="flex-1 text-[14.5px] font-bold">{p.name}</Text>
                      <Text variant="mono">{formatMoney(p.priceCents, pubProducts.data.currency)}</Text>
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {p.kind === 'SINGLE'
                        ? 'Una clase'
                        : p.kind === 'PACKAGE'
                          ? `${p.credits} clases${p.validityDays ? ` · vigencia ${p.validityDays} días` : ''}`
                          : `Clases ilimitadas · ${p.validityDays} días`}
                      {p.kind !== 'SINGLE' && p.seats > 1 ? ` · para ${p.seats} personas` : ''}
                    </Text>
                    {p.description ? <Text className="text-xs leading-[18px] text-muted-foreground">{p.description}</Text> : null}
                    {pubProducts.data.acceptsCard || pubProducts.data.acceptsTransfer ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => router.push({ pathname: '/buy', params: { orgId: id, productId: p.id } })}
                      >
                        <Text>{pubProducts.data.acceptsCard ? 'Comprar' : 'Pagar por transferencia'}</Text>
                      </Button>
                    ) : null}
                  </View>
                ))}
                {pubProducts.data.acceptsCash ? (
                  <Text variant="muted" className="text-xs">
                    También puedes pagar en efectivo en recepción.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          <SectionHeader title="Próximas clases" variant="title" />
          {days.size === 0 ? <Text variant="muted">No hay clases programadas en las próximas semanas.</Text> : null}
          {[...days.entries()].map(([date, list]) => (
            <View key={date} className="gap-2">
              <Text variant="overline">{longDate(date)}</Text>
              {list.map((s) => {
                const full = s.left === 0;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push({ pathname: '/class/[id]', params: { id: s.id } })}
                    className="gap-1.5 rounded-[20px] bg-card px-3.5 py-3 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-90"
                  >
                    <View className="flex-row items-center gap-3">
                      <Text className="w-[46px] font-mono-bold text-[13px]">{formatTime(s.startsAt, o.timezone)}</Text>
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-bold" numberOfLines={1}>
                          {s.serviceName}
                        </Text>
                        <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                          {[s.instructorName, s.roomName].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text
                        className={cn(
                          'text-xs font-bold',
                          s.mineBookingId ? 'text-teal' : full || s.left <= 2 ? 'text-primary-dark' : 'text-muted-foreground'
                        )}
                      >
                        {s.mineBookingId ? 'Reservada' : full ? 'Llena' : `Quedan ${s.left}`}
                      </Text>
                    </View>
                    <ProgressBar value={s.capacity ? s.booked / s.capacity : 0} tone={tone} height={5} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
