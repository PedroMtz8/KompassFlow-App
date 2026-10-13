import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { Badge } from '@/components/ui/badge';
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
    <Pressable
      onPress={() => router.push({ pathname: '/org/[id]', params: { id: o.id } })}
      className="overflow-hidden rounded-[22px] bg-card shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-90"
      style={{ width }}
    >
      {o.coverImage ? (
        <Photo uri={o.coverImage} height={110} />
      ) : (
        <Gradient tone={toneFor(o.id)} style={{ height: 110, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-3xl font-extrabold text-white">{initialsOf(o.name)}</Text>
        </Gradient>
      )}
      <View className="gap-2 p-3.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-[15.5px] font-extrabold" numberOfLines={1}>
            {o.name}
          </Text>
          {distance ? <Text className="font-mono text-xs text-muted-foreground">{distance}</Text> : null}
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
    </Pressable>
  );
}
