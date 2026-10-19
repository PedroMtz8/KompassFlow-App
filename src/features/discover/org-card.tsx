import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { Badge } from '@/components/ui/badge';
import { CARD_SHADOW } from '@/components/ui/card';
import { PressScale } from '@/components/ui/press-scale';
import { Gradient } from '@/components/ui/gradient';
import { Photo } from '@/components/ui/photo';
import { Text } from '@/components/ui/text';
import type { DiscoverOrgItem } from '@/features/bookings/queries';
import { toneFor } from '@/features/session/switch-space-screen';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Tarjeta de academia: portada, colonia, disciplinas y cuántas clases tiene próximas. */
export function OrgCard({ o, distance, width }: { o: DiscoverOrgItem; distance?: string; width: '49%' | '100%' }) {
  const t = useTheme();
  return (
    <PressScale
      onPress={() => router.push({ pathname: '/org/[id]', params: { id: o.id } })}
      scale={0.975}
      className={`overflow-hidden rounded-[26px] border border-ink/[0.045] bg-card ${CARD_SHADOW}`}
      style={{ width }}
    >
      <View>
        {o.coverImage ? (
          <Photo uri={o.coverImage} height={132} />
        ) : (
          <Gradient tone={toneFor(o.id)} style={{ height: 132, alignItems: 'center', justifyContent: 'center' }}>
            <Text className="text-3xl font-extrabold text-white">{initialsOf(o.name)}</Text>
          </Gradient>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(16,32,26,0)', 'rgba(16,32,26,0.38)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 }}
        />
        {distance ? (
          <View className="absolute bottom-2.5 left-3 rounded-full bg-white/90 px-2.5 py-1">
            <Text className="font-mono-bold text-[11px] text-ink">{distance}</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-2 p-3.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-[15.5px] font-extrabold" numberOfLines={1}>
            {o.name}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {[o.neighborhood, o.city].filter(Boolean).join(', ')} · {o.type === 'PERSONAL' ? 'Personal' : 'Estudio'}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {o.disciplines.slice(0, 3).map((d) => (
            <Badge key={d} tone={toneFor(o.id)}>
              {d}
            </Badge>
          ))}
        </View>
        <Text className="text-xs font-bold" style={{ color: o.upcomingSessions ? t.tealDark : t.subtle }}>
          {o.upcomingSessions ? `${o.upcomingSessions} clases próximas` : 'Sin clases próximas'}
        </Text>
      </View>
    </PressScale>
  );
}
