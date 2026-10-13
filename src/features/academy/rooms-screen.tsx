import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { MapPin, Navigation, Pencil, Plus, Ruler, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { DashedButton } from '@/components/ui/dashed-button';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { TintedStat } from '@/components/ui/tinted-stat';
import { useActiveOrganization, useOrganization } from '@/features/organizations/queries';
import { can } from '@/features/organizations/permissions';
import { toneFor } from '@/features/session/switch-space-screen';

/** Sedes y espacios (salones, salas, canchas…) de la organización activa. */
export function RoomsScreen() {
  const t = useTheme();
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const d = detail.data;
  const term = d?.vertical.terms;
  const canEdit = can(org, 'location', 'update');

  return (
    <Screen>
      <ScreenHeader title={`Ubicación y ${term?.rooms.toLowerCase() ?? 'espacios'}`} subtitle={d?.name ?? org?.name} />
      <ScreenScroll contentContainerClassName="gap-3">
        <QueryStatus q={detail} />
        {d?.locations.map((loc) => {
          const totalSeats = loc.rooms.reduce((sum, r) => sum + r.capacity, 0);
          const mapsLink =
            loc.mapsUrl ??
            `https://www.google.com/maps/search/?api=1&query=${loc.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : encodeURIComponent(`${loc.address}, ${loc.city}`)}`;
          return (
            <View key={loc.id} className="gap-3">
              <View className="flex-row items-center gap-[11px] rounded-3xl bg-card p-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
                <View className="h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-primary-soft">
                  <Icon as={MapPin} size={19} color={t.primary} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-bold">{loc.address}</Text>
                  <Text className="text-xs text-muted-foreground">{[loc.neighborhood, loc.city].filter(Boolean).join(', ')}</Text>
                </View>
                {canEdit ? (
                  <Pressable
                    onPress={() => router.push({ pathname: '/edit-location', params: { locationId: loc.id } })}
                    className="h-9 w-9 items-center justify-center rounded-[11px] bg-muted active:opacity-70"
                  >
                    <Icon as={Pencil} size={15} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => Linking.openURL(mapsLink)}
                  className="flex-row items-center gap-[5px] rounded-[11px] bg-muted px-[11px] py-[9px] active:opacity-70"
                >
                  <Icon as={Navigation} size={14} />
                  <Text className="text-[12.5px] font-bold">Maps</Text>
                </Pressable>
              </View>

              <View className="flex-row gap-2.5">
                <TintedStat icon={Ruler} tone="violet" value={String(loc.rooms.length)} label={term?.rooms.toLowerCase() ?? 'espacios'} />
                <TintedStat icon={Users} tone="teal" value={String(totalSeats)} label="lugares en total" />
              </View>

              <SectionHeader title={term?.rooms ?? 'Espacios'} className="pt-0.5" />
              {loc.rooms.map((r) => (
                <Pressable
                  key={r.id}
                  disabled={!canEdit}
                  onPress={() => router.push({ pathname: '/add-room', params: { roomId: r.id } })}
                  className="flex-row items-center gap-3 rounded-[22px] bg-card px-3.5 py-3 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-90"
                >
                  <Gradient
                    tone={toneFor(r.id)}
                    style={{ width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text className="font-mono-bold text-lg leading-[18px] text-white">{r.capacity}</Text>
                    <Text className="text-[9px] font-extrabold tracking-[0.06em] text-white/90">CUPO</Text>
                  </Gradient>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-[14.5px] font-bold">{r.name}</Text>
                    {r.note ? <Text className="text-xs text-muted-foreground">{r.note}</Text> : null}
                  </View>
                  {canEdit ? <Icon as={Pencil} size={15} color="#9A93A0" /> : null}
                </Pressable>
              ))}
              {canEdit && term ? (
                <DashedButton
                  label={`Agregar ${term.room.toLowerCase()}`}
                  icon={Plus}
                  onPress={() => router.push({ pathname: '/add-room', params: { locationId: loc.id } })}
                />
              ) : null}
            </View>
          );
        })}
      </ScreenScroll>
    </Screen>
  );
}
