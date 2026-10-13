import { router, useLocalSearchParams } from 'expo-router';
import { Check, Clock, Info, Lock, Plus, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatCard } from '@/components/ui/stat-card';
import { Text } from '@/components/ui/text';
import { useAttendance, useAttendanceMutations } from '@/features/bookings/queries';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization } from '@/features/organizations/queries';
import { useClassContext } from '@/features/classes/use-class-context';
import { formatTime } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { useNow } from '@/lib/use-now';

function MarkButton({ kind, active, onPress }: { kind: 'present' | 'absent'; active: boolean; onPress: () => void }) {
  const glyph = kind === 'present' ? Check : X;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-label={kind === 'present' ? 'Presente' : 'Falta'}
      aria-pressed={active}
      className="h-[38px] w-[38px] overflow-hidden rounded-xl active:opacity-80"
    >
      {active ? (
        <Gradient tone={kind === 'present' ? 'teal' : 'pink'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={glyph} size={18} color="#fff" strokeWidth={3} />
        </Gradient>
      ) : (
        <View className="flex-1 items-center justify-center bg-muted">
          <Icon as={glyph} size={18} color="#6B6270" strokeWidth={2.5} />
        </View>
      )}
    </Pressable>
  );
}

/** Pase de lista de una sesión: presente / falta por reserva, cierre de lista y reapertura. */
export function AttendanceScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const att = useAttendance(activeId, sessionId);
  const mut = useAttendanceMutations(activeId ?? '', sessionId ?? '');
  const editable = can(org, 'attendance', 'update');
  const now = useNow();
  const { tz } = useClassContext();

  if (att.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Pasar lista" />
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }
  if (!att.data) {
    return (
      <Screen>
        <ScreenHeader title="Pasar lista" />
        <ScreenScroll>
          <Text variant="muted">No encontramos esta sesión.</Text>
        </ScreenScroll>
      </Screen>
    );
  }

  const { session, summary, students, opensAt, canMark, teacherName } = att.data;
  const closed = !!session.closedAt;
  const claims = students.filter(
    (r) => r.status !== 'PRESENT' && r.checkedInAt && +new Date(r.checkedInAt) > +new Date(session.endsAt)
  ).length;
  const tooEarly = now < new Date(opensAt).getTime();
  const locked = closed || tooEarly || session.status === 'CANCELED' || !editable || !canMark;
  const time = formatTime(session.startsAt, tz);

  const set = (bookingId: string, current: string | null, status: 'PRESENT' | 'ABSENT') =>
    mut.mark.mutate({ bookingId, status: current === status ? null : status }, { onError: (e) => done(e.message) });
  const close = () =>
    mut.close.mutate(undefined, {
      onSuccess: (r) => {
        const parts = [
          r?.autoPresent ? `${r.autoPresent} que avisó${r.autoPresent === 1 ? '' : 'on'} que llegó${r.autoPresent === 1 ? '' : 'on'} quedó${r.autoPresent === 1 ? '' : 'aron'} como presente${r.autoPresent === 1 ? '' : 's'}` : '',
          r?.autoAbsent ? `${r.autoAbsent} sin marcar quedó${r.autoAbsent === 1 ? '' : 'aron'} como falta${r.autoAbsent === 1 ? '' : 's'}` : '',
        ].filter(Boolean);
        done(parts.length ? `Lista cerrada · ${parts.join(' · ')}` : 'Lista cerrada');
      },
      onError: (e) => done(e.message),
    });
  const reopen = () => mut.reopen.mutate(undefined, { onSuccess: () => done('Lista reabierta'), onError: (e) => done(e.message) });

  return (
    <Screen>
      <ScreenHeader title="Pasar lista" subtitle={`${time} · ${summary.total} ${summary.total === 1 ? 'reserva' : 'reservas'}`} />
      <View className="mx-auto w-full max-w-[480px] md:max-w-[680px] gap-2.5 px-5 pb-2.5">
        <StatCard
          title="Asistencia"
          icon={Check}
          tone="teal"
          stats={[
            { value: String(summary.present), label: 'presentes' },
            { value: String(summary.absent), label: summary.absent === 1 ? 'falta' : 'faltas' },
            { value: String(summary.unmarked), label: 'sin marcar' },
          ]}
        />
        {!closed && !tooEarly && summary.unmarked > 0 ? (
          <InfoBanner
            icon={Info}
            tone="violet"
            text="Al cerrar la lista, quien avisó que llegó durante la clase cuenta como presente. El resto sin marcar queda como falta, incluso quien dice que asistió después, a menos que lo confirmes."
          />
        ) : null}
        {!canMark && editable && session.status !== 'CANCELED' ? (
          <InfoBanner
            icon={Lock}
            tone="amber"
            text={`Esta clase ${teacherName ? `la imparte ${teacherName}` : 'no es tuya'}: solo puedes verla. Pasar lista en clases de otras personas requiere un permiso especial.`}
          />
        ) : null}
        {closed ? <InfoBanner icon={Lock} tone="teal" text={canMark ? 'Lista cerrada. Reábrela si necesitas corregir algo.' : 'La lista de esta clase ya está cerrada.'} /> : null}
        {claims > 0 ? (
          <InfoBanner
            icon={Info}
            tone="violet"
            text={`${claims} ${claims === 1 ? 'alumno dice' : 'alumnos dicen'} que sí asistió.${closed ? ' Reabre la lista para corregir.' : ' Márcalo como presente si es correcto.'}`}
          />
        ) : null}
        {tooEarly && !closed ? (
          <InfoBanner
            icon={Clock}
            tone="amber"
            text={`El pase de lista se abre a las ${formatTime(opensAt, tz)} (1 hora antes).`}
          />
        ) : null}
      </View>
      <ScreenScroll contentContainerClassName="gap-0">
        {students.length === 0 ? <Text variant="muted">Aún no hay reservas en esta sesión.</Text> : null}
        {students.map((r, i) => (
          <View key={r.bookingId}>
            <View className="flex-row items-center gap-[11px] py-2">
              <Avatar uri={r.image} name={r.name} size={40} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-sm font-bold" numberOfLines={1}>
                  {r.name}
                </Text>
                {r.status !== 'PRESENT' && r.checkedInAt && +new Date(r.checkedInAt) > +new Date(session.endsAt) ? (
                  <Text className="text-[11px] font-bold text-violet-dark">
                    Dice que sí asistió{r.status === 'ABSENT' ? ' (está como falta)' : ''}
                  </Text>
                ) : r.status === null && r.checkedInAt ? (
                  <Text className="text-[11px] font-bold text-teal-dark">
                    Avisó que llegó · {formatTime(r.checkedInAt, tz)}
                  </Text>
                ) : (
                  <Text className="text-[11px] text-muted-foreground">
                    {r.status === 'PRESENT' ? 'Presente' : r.status === 'ABSENT' ? 'Falta' : 'Sin marcar'}
                  </Text>
                )}
              </View>
              <View style={{ opacity: locked ? 0.5 : 1 }} pointerEvents={locked ? 'none' : 'auto'} className="flex-row gap-2">
                <MarkButton kind="absent" active={r.status === 'ABSENT'} onPress={() => set(r.bookingId, r.status, 'ABSENT')} />
                <MarkButton kind="present" active={r.status === 'PRESENT'} onPress={() => set(r.bookingId, r.status, 'PRESENT')} />
              </View>
            </View>
            {i < students.length - 1 ? <ListDivider /> : null}
          </View>
        ))}
      </ScreenScroll>
      {editable && canMark && session.status !== 'CANCELED' ? (
        <FooterBar className="flex-row gap-2.5">
          {!closed ? (
            <Pressable
              onPress={() => router.push({ pathname: '/add-to-roster', params: { sessionId: session.id } })}
              className="h-[54px] w-[54px] items-center justify-center rounded-[17px] bg-card active:opacity-80"
            >
              <Icon as={Plus} size={20} />
            </Pressable>
          ) : null}
          {closed ? (
            <Button size="lg" variant="secondary" className="flex-1" onPress={reopen} disabled={mut.reopen.isPending}>
              <Text className="text-[15.5px]">Reabrir lista</Text>
            </Button>
          ) : (
            <Button size="lg" className="flex-1 bg-teal shadow-none" onPress={close} disabled={tooEarly || mut.close.isPending}>
              <Text className="text-[15.5px]">
                Cerrar lista · {summary.present} de {summary.total}
              </Text>
            </Button>
          )}
        </FooterBar>
      ) : null}
    </Screen>
  );
}
