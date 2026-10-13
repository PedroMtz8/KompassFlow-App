import { TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ApiError } from '@/features/organizations/queries';
import { asDateString, longDate } from '@/lib/dates';

/** Choques de horario devueltos por el servidor: espacio ocupado o instructor con otra sesión. */
export function ConflictList({
  error,
  roomTerm,
  instructorTerm,
}: {
  error: ApiError | Error | undefined;
  roomTerm: string;
  instructorTerm: string;
}) {
  if (!error) return null;
  const conflicts = (error as ApiError).conflicts;
  return (
    <View className="gap-2 rounded-[20px] bg-[#FDE8E6] p-3.5">
      <View className="flex-row items-center gap-2">
        <Icon as={TriangleAlert} size={16} color="#D92D20" />
        <Text className="flex-1 text-[13px] font-bold text-destructive">{error.message}</Text>
      </View>
      {conflicts?.slice(0, 5).map((c, i) => (
        <Text key={i} className="text-xs text-[#7A271A]">
          {longDate(asDateString(c.date))} · {c.time} — {c.kind === 'room' ? `${roomTerm} ocupado` : `${instructorTerm} ocupado`} por “
          {c.with}”
        </Text>
      ))}
      {conflicts && conflicts.length > 5 ? <Text className="text-xs text-[#7A271A]">y {conflicts.length - 5} más…</Text> : null}
    </View>
  );
}
