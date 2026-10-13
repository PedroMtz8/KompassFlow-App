import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Copy, KeyRound } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { MiniStat } from '@/components/ui/tinted-stat';
import { useCreateLinkCode, useStudent } from '@/features/bookings/queries';
import { useActiveOrganization } from '@/features/organizations/queries';
import { done } from '@/lib/simulate';

/** Vincular un alumno de recepción con la cuenta de la persona: se genera un código de un solo uso. */
export function LinkAccountScreen() {
  const t = useTheme();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const q = useStudent(activeId, studentId);
  const gen = useCreateLinkCode(activeId ?? '');
  const st = q.data;

  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Vincular cuenta" />
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }
  if (q.isError) return <ErrorNotice fill what="al alumno" busy={q.isFetching} onRetry={q.refetch} />;
  if (!st) {
    return (
      <Screen>
        <ScreenHeader title="Vincular cuenta" />
        <ScreenScroll>
          <Text variant="muted">No encontramos a este alumno.</Text>
        </ScreenScroll>
      </Screen>
    );
  }
  const present = st.history.filter((h) => h.attendance === 'PRESENT').length;
  const code = gen.data;

  return (
    <Screen>
      <ScreenHeader title="Vincular cuenta" subtitle={st.name} />
      <ScreenScroll contentContainerClassName="gap-3">
        <View className="gap-2.5 rounded-[22px] bg-card p-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
          <Text variant="overline">Registro en {org?.name}</Text>
          <Text className="text-[15px] font-bold">{st.name}</Text>
          <View className="flex-row gap-2">
            <MiniStat value={String(present)} label="asistencias" tone="orange" />
            <MiniStat value={String(st.history.length)} label="reservas" tone="violet" />
          </View>
        </View>

        {st.hasAccount ? (
          <Text variant="muted">Este alumno ya tiene una cuenta vinculada.</Text>
        ) : (
          <View className="gap-2 rounded-[22px] bg-card p-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)]">
            <Text variant="overline">Cómo funciona</Text>
            <Text variant="muted" className="text-[13px]">
              1. Genera un código y compártelo con la persona (en persona o por mensaje).{'\n'}2. Ella lo escribe en su Perfil → «Tengo un
              código de mi academia».{'\n'}3. Su historial, asistencias y reservas quedan en su cuenta. El código es de un solo uso y vence
              en 7 días.
            </Text>
          </View>
        )}

        {code ? (
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(code.code);
              done('Código copiado');
            }}
            className="items-center gap-2 rounded-[22px] bg-violet-soft p-5 active:opacity-80"
          >
            <Text className="font-mono-bold text-[32px] tracking-[0.12em] text-violet-dark">{code.code}</Text>
            <View className="flex-row items-center gap-1.5">
              <Icon as={Copy} size={14} color={t.violetDark} />
              <Text className="text-xs font-bold text-violet-dark">
                Toca para copiar · vence el{' '}
                {new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(code.expiresAt))}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </ScreenScroll>
      {!st.hasAccount ? (
        <FooterBar>
          <Button
            size="lg"
            className="bg-violet shadow-none"
            disabled={gen.isPending}
            onPress={() => gen.mutate(st.id, { onError: (e) => done(e.message) })}
          >
            <Icon as={KeyRound} size={18} color="#fff" />
            <Text className="text-[15.5px]">{code ? 'Generar otro código' : 'Generar código'}</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}
