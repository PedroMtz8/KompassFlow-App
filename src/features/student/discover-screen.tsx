import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import MapPin from 'lucide-react-native/icons/map-pin';
import Search from 'lucide-react-native/icons/search';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import X from 'lucide-react-native/icons/x';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { PlacesMap } from '@/components/map/places-map';
import type { MapPin as Pin } from '@/components/map/types';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { CARD_SHADOW } from '@/components/ui/card';
import { PressScale } from '@/components/ui/press-scale';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useDiscoverOrgs, useDiscoverSessions, type DiscoverOrgItem, type DiscoverSession } from '@/features/bookings/queries';
import { levelLabel } from '@/features/classes/class-labels';
import { activeFilterCount, useDiscoverFilters, whenLabel } from '@/features/discover/filters';
import { OrgCard } from '@/features/discover/org-card';
import { useCatalog } from '@/features/interests/queries';
import { NotificationBell } from '@/features/notifications/bell';
import { useZones } from '@/features/organizations/queries';
import { toneFor } from '@/features/session/switch-space-screen';
import { formatMoney, formatTime, relativeDay } from '@/lib/dates';
import { useDebounced } from '@/lib/use-debounced';
import { useIsDesktop } from '@/lib/use-layout';
import { cn } from '@/lib/utils';
import { distanceKm, formatDistance, useLocation } from '@/stores/location';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

type Tab = 'classes' | 'orgs' | 'map';

function SessionCard({ s, width, distance, showForYou }: { s: DiscoverSession; width: '49%' | '100%'; distance?: string; showForYou?: boolean }) {
  const tone = toneFor(s.organizationId);
  const full = s.left === 0;
  const left = s.mineBookingId ? ('mine' as const) : full ? ('full' as const) : s.left <= 3 ? ('few' as const) : ('ok' as const);
  const status = {
    mine: { text: 'Reservada', bg: 'bg-[#E0F5E9]', fg: 'text-[#13703F]' },
    full: { text: 'Llena', bg: 'bg-primary-soft', fg: 'text-primary-dark' },
    few: { text: `Quedan ${s.left}`, bg: 'bg-amber-soft', fg: 'text-amber-dark' },
    ok: { text: `Quedan ${s.left}`, bg: 'bg-muted', fg: 'text-muted-foreground' },
  }[left];
  return (
    <PressScale
      onPress={() => router.push({ pathname: '/class/[id]', params: { id: s.id } })}
      scale={0.975}
      className={cn('flex-row items-center gap-3 rounded-[24px] border border-ink/[0.045] bg-card p-[11px]', CARD_SHADOW)}
      style={{ width }}
    >
      <View>
        {(s.logo ?? s.coverImage) ? (
          <Photo uri={(s.logo ?? s.coverImage)!} width={76} height={84} radius={18} />
        ) : (
          <Gradient tone={tone} style={{ width: 76, height: 84, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text className="text-xl font-extrabold text-white">{initialsOf(s.organizationName)}</Text>
          </Gradient>
        )}
        <View className="absolute inset-x-1.5 bottom-1.5 items-center rounded-[9px] bg-ink/85 py-[3px]">
          <Text className="font-mono-bold text-[11px] text-white">{formatTime(s.startsAt, s.timezone)}</Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-[15px] font-extrabold tracking-[-0.01em]" numberOfLines={1}>
            {s.serviceName}
          </Text>
          <Text variant="mono" className="text-[13px] text-primary-dark">
            {s.priceCents ? formatMoney(s.priceCents, s.currency) : 'Gratis'}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {showForYou && s.forYou ? <Text className="text-xs font-bold text-primary">Para ti · </Text> : null}
          {s.organizationName} · {relativeDay(+new Date(s.startsAt), s.timezone)}
          {distance ? ` · ${distance}` : s.neighborhood ? ` · ${s.neighborhood}` : ''}
        </Text>
        <View className="flex-row items-center gap-2 pt-0.5">
          <View className="flex-1">
            <ProgressBar value={s.capacity ? s.booked / s.capacity : 0} tone={tone} />
          </View>
          <View className={cn('rounded-full px-2 py-[3px]', status.bg)}>
            <Text className={cn('text-[10.5px] font-extrabold', status.fg)}>{status.text}</Text>
          </View>
        </View>
      </View>
    </PressScale>
  );
}

/** Chip de un filtro activo; la X lo quita. */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable onPress={onRemove} className="flex-row items-center gap-1.5 rounded-full bg-ink py-2 pl-3.5 pr-2.5 active:opacity-80">
      <Text className="text-[12.5px] font-bold text-white">{label}</Text>
      <Icon as={X} size={13} color="#fff" strokeWidth={2.5} />
    </Pressable>
  );
}

/** Inicio del alumno: clases y academias de Tepic, con filtros combinables y mapa. */
export function DiscoverScreen() {
  const desktop = useIsDesktop();
  const winHeight = useWindowDimensions().height;
  const zones = useZones();
  const city = zones.data?.[0];
  const place = city ? `${city.name}, ${city.state}` : 'Tu ciudad';
  const catalog = useCatalog();
  const f = useDiscoverFilters();
  const loc = useLocation();
  const [query, setQuery] = useState('');
  const sessionsQ = useDiscoverSessions(useDebounced(query));
  const orgsQ = useDiscoverOrgs();

  // Jalar hacia abajo (como en Instagram o Facebook) vuelve a pedir clases y academias al servidor.
  const refresh = useCallback(() => Promise.allSettled([sessionsQ.refetch(), orgsQ.refetch()]), [sessionsQ, orgsQ]);

  // Al volver a esta pantalla (por ejemplo tras reservar o cambiar de pestaña) los datos se actualizan solos.
  useFocusEffect(
    useCallback(() => {
      sessionsQ.refetch();
      orgsQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // `?tab=map|orgs` permite abrir Descubrir directo en esa pestaña (enlaces profundos).
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'map' || params.tab === 'orgs' ? params.tab : 'classes');
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const disciplineName = new Map((catalog.data ?? []).flatMap((v) => v.disciplines).map((d) => [d.id, d.name]));
  const count = activeFilterCount(f);
  const q = query.trim().toLowerCase();
  const km = (lat: number | null, lng: number | null) =>
    loc.coords && lat != null && lng != null ? distanceKm(loc.coords, { lat, lng }) : null;

  // Clases: filtros combinados + búsqueda; orden por horario (ya viene así) o por cercanía.
  const sessions = [...(sessionsQ.data ?? [])];
  // Sin filtro de disciplina, lo que coincide con tus intereses va primero (cada grupo sigue en orden de horario).
  const personalized = f.sort === 'time' && f.disciplineIds.length === 0 && sessions.some((s) => s.forYou);
  if (personalized) sessions.sort((a, b) => Number(b.forYou) - Number(a.forYou));
  if (f.sort === 'near' && loc.coords) {
    sessions.sort((a, b) => (km(a.lat, a.lng) ?? 1e9) - (km(b.lat, b.lng) ?? 1e9) || +new Date(a.startsAt) - +new Date(b.startsAt));
  }

  // Academias: con filtros activos solo las que tienen clases que cumplen.
  const orgIdsWithMatches = new Set(sessions.map((s) => s.organizationId));
  const orgs = (orgsQ.data ?? [])
    .filter((o) =>
      count === 0 && !q
        ? true
        : orgIdsWithMatches.has(o.id) ||
          (!count && `${o.name} ${o.neighborhood ?? ''} ${o.disciplines.join(' ')}`.toLowerCase().includes(q))
    )
    .map((o) => ({ o, km: km(o.lat, o.lng) }));
  if (f.sort === 'near' && loc.coords) orgs.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));

  const pins: Pin[] = orgs
    .filter(({ o }) => o.lat != null && o.lng != null)
    .map(({ o }) => ({ id: o.id, lat: o.lat!, lng: o.lng!, title: o.name, subtitle: o.neighborhood ?? undefined }));
  const selected: DiscoverOrgItem | undefined = orgs.find(({ o }) => o.id === selectedOrg)?.o;

  const width = desktop ? '49%' : '100%';
  const loading = sessionsQ.isPending || orgsQ.isPending;
  const failed = sessionsQ.isError || orgsQ.isError;

  const useMyLocation = () =>
    loc.status === 'granted' ? f.setSort(f.sort === 'near' ? 'time' : 'near') : loc.request().then(() => f.setSort('near'));

  const list =
    tab === 'orgs' ? (
      <View className="flex-row flex-wrap gap-2.5">
        {orgs.map(({ o, km: d }) => (
          <OrgCard key={o.id} o={o} width={width} distance={d != null ? formatDistance(d) : undefined} />
        ))}
        {!loading && !failed && orgs.length === 0 ? <Empty filtered={count > 0 || !!q} what="academias" /> : null}
      </View>
    ) : (
      <View className="flex-row flex-wrap gap-2.5">
        {sessions.map((s) => {
          const d = km(s.lat, s.lng);
          return <SessionCard key={s.id} s={s} width={width} showForYou={personalized} distance={d != null ? formatDistance(d) : undefined} />;
        })}
        {!loading && !failed && sessions.length === 0 ? <Empty filtered={count > 0 || !!q} what="clases" /> : null}
      </View>
    );

  const map = (
    <View className="overflow-hidden rounded-3xl bg-muted">
      <PlacesMap
        pins={pins}
        selectedId={selectedOrg}
        onSelect={setSelectedOrg}
        user={loc.coords}
        height={desktop ? 520 : Math.max(360, winHeight - 400)}
      />
      {selected ? (
        <Pressable
          onPress={() => router.push({ pathname: '/org/[id]', params: { id: selected.id } })}
          className="absolute inset-x-3 bottom-3 flex-row items-center gap-3 rounded-[20px] bg-card p-3 shadow-[0_8px_24px_rgba(27,22,32,0.18)] active:opacity-90"
        >
          {(selected.logo ?? selected.coverImage) ? (
            <Photo uri={(selected.logo ?? selected.coverImage)!} width={52} height={52} radius={14} />
          ) : (
            <Gradient tone={toneFor(selected.id)} style={{ width: 52, height: 52, borderRadius: 14 }} />
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-sm font-extrabold" numberOfLines={1}>
              {selected.name}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {selected.neighborhood} · {selected.upcomingSessions} clases próximas
            </Text>
          </View>
          <Text className="text-xs font-bold text-primary">Ver</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-0 pb-10" onRefresh={refresh}>
        <View className="flex-row items-center justify-between pb-3 pt-1">
          <View className="gap-[3px]">
            <View className="flex-row items-center gap-1">
              <Icon as={MapPin} size={13} color="#6B6270" />
              <Text className="text-[12.5px] font-semibold text-muted-foreground">{place}</Text>
            </View>
            <Text variant="h1">¿Qué bailas hoy?</Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            {desktop ? <RefreshButton onPress={refresh} busy={sessionsQ.isFetching || orgsQ.isFetching} /> : <NotificationBell />}
          </View>
        </View>

        <View className="flex-row gap-2.5 pb-3">
          <View className="h-[52px] flex-1 flex-row items-center gap-2.5 rounded-[18px] border border-ink/[0.05] bg-card px-4 shadow-[0_1px_2px_rgba(16,32,26,0.04),0_10px_22px_-10px_rgba(16,32,26,0.14)]">
            <Icon as={Search} size={18} color="#A69DAB" />
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Bachata, salsa, academia…"
              className="h-12 flex-1 border-0 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
            />
          </View>
          <PressScale
            onPress={useMyLocation}
            accessibilityLabel="Ordenar por cercanía"
            scale={0.92}
            className={cn(
              'h-[52px] w-[52px] items-center justify-center rounded-[18px]',
              f.sort === 'near' && loc.coords
                ? 'bg-primary shadow-[0_10px_20px_-8px_var(--color-primary-glow)]'
                : 'border border-ink/[0.05] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.04),0_10px_22px_-10px_rgba(16,32,26,0.14)]'
            )}
          >
            {loc.status === 'loading' ? (
              <ActivityIndicator />
            ) : (
              <Icon as={LocateFixed} size={19} color={f.sort === 'near' && loc.coords ? '#fff' : '#1B1620'} />
            )}
          </PressScale>
          <PressScale
            onPress={() => router.push('/filters')}
            scale={0.92}
            className="h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-ink shadow-[0_10px_22px_-8px_rgba(16,32,26,0.55)]"
          >
            <Icon as={SlidersHorizontal} size={19} color="#fff" />
            {count ? (
              <View className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
                <Text className="text-[10.5px] font-extrabold text-white">{count}</Text>
              </View>
            ) : null}
          </PressScale>
        </View>

        {count ? (
          <View className="flex-row flex-wrap items-center gap-2 pb-3">
            {f.when.map((w) => (
              <ActiveChip key={w} label={whenLabel[w]} onRemove={() => f.toggleWhen(w)} />
            ))}
            {f.disciplineIds.map((id) => (
              <ActiveChip key={id} label={disciplineName.get(id) ?? 'Disciplina'} onRemove={() => f.toggleDiscipline(id)} />
            ))}
            {f.levels.map((l) => (
              <ActiveChip key={l} label={levelLabel[l]} onRemove={() => f.toggleLevel(l)} />
            ))}
            {f.onlyAvailable ? <ActiveChip label="Con lugares" onRemove={() => f.setOnlyAvailable(false)} /> : null}
            <Pressable onPress={f.clear} hitSlop={8}>
              <Text className="px-1 text-[12.5px] font-bold text-primary">Limpiar</Text>
            </Pressable>
          </View>
        ) : null}

        {loc.status === 'denied' ? (
          <Text variant="muted" className="pb-3 text-xs">
            Sin permiso de ubicación: actívalo en Ajustes para ver la distancia a cada academia.
          </Text>
        ) : null}

        {!desktop ? (
          <View className="pb-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'classes', label: `Clases${sessionsQ.data ? ` · ${sessions.length}` : ''}` },
                { value: 'orgs', label: `Academias${orgsQ.data ? ` · ${orgs.length}` : ''}` },
                { value: 'map', label: 'Mapa' },
              ]}
            />
          </View>
        ) : (
          <View className="pb-3" style={{ maxWidth: 360 }}>
            <Segmented
              value={tab === 'map' ? 'classes' : tab}
              onChange={setTab}
              options={[
                { value: 'classes', label: `Clases · ${sessions.length}` },
                { value: 'orgs', label: `Academias · ${orgs.length}` },
              ]}
            />
          </View>
        )}

        {loading ? <ActivityIndicator /> : null}
        {failed ? (
          <ErrorNotice
            what="los resultados"
            busy={sessionsQ.isFetching || orgsQ.isFetching}
            onRetry={() => Promise.all([sessionsQ.refetch(), orgsQ.refetch()])}
          />
        ) : null}

        {desktop ? (
          <View className="flex-row items-start gap-5">
            <View className="min-w-0 flex-1">{list}</View>
            <View style={{ width: 420 }}>{map}</View>
          </View>
        ) : tab === 'map' ? (
          map
        ) : (
          list
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Empty({ filtered, what }: { filtered: boolean; what: string }) {
  const f = useDiscoverFilters();
  return (
    <View className="w-full items-center gap-2 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
      <Text className="text-base font-extrabold">{filtered ? `No hay ${what} con esos filtros` : `Aún no hay ${what}`}</Text>
      <Text variant="muted" className="text-center">
        {filtered ? 'Prueba quitando algún filtro.' : 'Cuando las academias publiquen horarios, los verás aquí.'}
      </Text>
      {filtered ? (
        <Button size="sm" variant="soft" onPress={f.clear}>
          <Text className="text-[13px]">Quitar filtros</Text>
        </Button>
      ) : null}
    </View>
  );
}
