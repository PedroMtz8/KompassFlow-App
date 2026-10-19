import { useQueryClient, useMutation } from '@tanstack/react-query';
import Plus from 'lucide-react-native/icons/plus';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { studentsKey, useStudents } from '@/features/bookings/queries';
import { api } from '@/lib/api';
import { done } from '@/lib/simulate';

type PassPerson = { studentId: string; name: string; hasAccount: boolean; image?: string | null; isHolder: boolean; used: number };

const fail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

/** Suma o quita personas de un paquete compartido. No necesitan cuenta: basta su registro de alumno. */
export function usePassPeopleMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: studentsKey(orgId) });
  return {
    add: useMutation({
      mutationFn: async (v: { passId: string; studentId: string }) => {
        const { error } = await api.orgs({ id: orgId }).passes({ passId: v.passId }).members.post({ studentId: v.studentId });
        if (error) fail(error, 'No se pudo sumar a la persona');
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (v: { passId: string; studentId: string }) => {
        const { error } = await api.orgs({ id: orgId }).passes({ passId: v.passId }).members({ studentId: v.studentId }).delete();
        if (error) fail(error, 'No se pudo quitar a la persona');
      },
      onSuccess: refresh,
    }),
  };
}

/**
 * Personas de un paquete compartido (en la ficha del alumno): quién lo usa, cuánto usó cada quien y los lugares libres.
 * Con `canEdit` se pueden sumar y quitar; quien pagó (titular) no se quita.
 */
export function PassPeople({
  orgId,
  passId,
  members,
  seats,
  vacant,
  unlimited,
  canEdit,
}: {
  orgId: string;
  passId: string;
  members: PassPerson[];
  seats: number;
  vacant: number;
  unlimited: boolean;
  canEdit: boolean;
}) {
  const mut = usePassPeopleMutations(orgId);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const found = useStudents(adding ? orgId : null, q.trim() || undefined);
  const inPass = new Set(members.map((m) => m.studentId));

  return (
    <View className="gap-2 border-t border-border pt-2.5">
      <View className="flex-row items-center gap-2">
        <Icon as={Users} size={14} />
        <Text className="flex-1 text-xs font-bold">
          {members.length} de {seats} personas
          {vacant > 0 ? ` · ${vacant} ${vacant === 1 ? 'lugar libre' : 'lugares libres'}` : ''}
        </Text>
      </View>
      {members.map((m) => (
        <View key={m.studentId} className="flex-row items-center gap-2.5">
          <Avatar uri={m.image} name={m.name} size={26} />
          <View className="min-w-0 flex-1">
            <Text className="text-[13px] font-bold" numberOfLines={1}>
              {m.name}
              {m.isHolder ? ' · pagó' : ''}
            </Text>
            {!unlimited ? (
              <Text variant="muted" className="text-[11px]">
                {m.used} {m.used === 1 ? 'clase usada' : 'clases usadas'}
              </Text>
            ) : null}
          </View>
          {canEdit && !m.isHolder ? (
            <Pressable
              onPress={() =>
                mut.remove.mutate({ passId, studentId: m.studentId }, { onSuccess: () => done('Persona quitada'), onError: (e) => done(e.message) })
              }
              disabled={mut.remove.isPending}
              accessibilityLabel={`Quitar a ${m.name}`}
              className="h-8 w-8 items-center justify-center rounded-lg active:opacity-70"
            >
              <Icon as={X} size={15} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {canEdit && vacant > 0 ? (
        adding ? (
          <View className="gap-2">
            <Input value={q} onChangeText={setQ} placeholder="Buscar alumno" className="h-11" />
            {found.data
              ?.filter((s) => !inPass.has(s.id))
              .slice(0, 6)
              .map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() =>
                    mut.add.mutate(
                      { passId, studentId: s.id },
                      {
                        onSuccess: () => {
                          setAdding(false);
                          setQ('');
                          done('Persona sumada al paquete');
                        },
                        onError: (e) => done(e.message),
                      }
                    )
                  }
                  className="flex-row items-center gap-2.5 rounded-xl bg-muted px-3 py-2 active:opacity-80"
                >
                  <Avatar uri={s.image} name={s.name} size={26} />
                  <Text className="flex-1 text-[13px] font-bold" numberOfLines={1}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} className="flex-row items-center gap-2 py-0.5 active:opacity-70">
            <Icon as={Plus} size={15} />
            <Text className="text-[13px] font-bold text-primary">Agregar persona</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
