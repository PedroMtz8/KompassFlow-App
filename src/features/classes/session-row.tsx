import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Gradient } from '@/components/ui/gradient';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import type { SessionItem } from '@/features/organizations/queries';
import { toneFor } from '@/features/session/switch-space-screen';
import { formatTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** Fila de una sesión en la agenda: hora, servicio, espacio/instructor y cupo. Abre el detalle. */
export function SessionRow({ s, tz }: { s: SessionItem; tz: string }) {
  const tone = toneFor(s.serviceId);
  const canceled = s.status === 'CANCELED';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session', params: { sessionId: s.id, date: s.date } })}
      className={cn('flex-row items-center gap-3 py-[9px] active:opacity-80', canceled && 'opacity-50')}
    >
      <Text className="w-[46px] font-mono-bold text-[13px]">{formatTime(s.startsAt, tz)}</Text>
      <Gradient tone={tone} direction="vertical" style={{ width: 4, height: 38, borderRadius: 4 }} />
      <View className="min-w-0 flex-1 gap-[5px]">
        <View className="flex-row justify-between gap-1.5">
          <Text className={cn('flex-1 text-sm font-bold', canceled && 'line-through')} numberOfLines={1}>
            {s.serviceName}
          </Text>
          <Text className="text-xs font-bold text-muted-foreground">{canceled ? 'Cancelada' : `${s.booked}/${s.capacity}`}</Text>
        </View>
        <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
          {[s.instructorName, s.roomName].filter(Boolean).join(' · ') || 'Sin asignar'}
        </Text>
        {!canceled ? <ProgressBar value={s.capacity ? s.booked / s.capacity : 0} tone={tone} height={5} /> : null}
      </View>
    </Pressable>
  );
}

/** Tarjeta compacta (vertical) para las columnas de la agenda semanal de escritorio. */
export function SessionCard({ s, tz }: { s: SessionItem; tz: string }) {
  const tone = toneFor(s.serviceId);
  const canceled = s.status === 'CANCELED';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session', params: { sessionId: s.id, date: s.date } })}
      className={cn(
        'gap-1.5 overflow-hidden rounded-2xl bg-card p-2.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-80',
        canceled && 'opacity-50'
      )}
    >
      <Gradient tone={tone} direction="horizontal" style={{ height: 3, borderRadius: 3, marginBottom: 2 }} />
      <Text className="font-mono-bold text-xs">{formatTime(s.startsAt, tz)}</Text>
      <Text className={cn('text-[13px] font-bold leading-[17px]', canceled && 'line-through')} numberOfLines={2}>
        {s.serviceName}
      </Text>
      <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
        {[s.roomName, s.instructorName].filter(Boolean).join(' · ') || 'Sin asignar'}
      </Text>
      <Text className="text-[11px] font-bold text-muted-foreground">{canceled ? 'Cancelada' : `${s.booked}/${s.capacity} lugares`}</Text>
    </Pressable>
  );
}
