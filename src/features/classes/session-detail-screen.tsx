import { router, useLocalSearchParams } from 'expo-router';
import CalendarX2 from 'lucide-react-native/icons/calendar-x-2';
import ClipboardCheck from 'lucide-react-native/icons/clipboard-check';
import EyeOff from 'lucide-react-native/icons/eye-off';
import UserPlus from 'lucide-react-native/icons/user-plus';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { FormGroup, FormScreen } from '@/components/form-screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { TimeField } from '@/components/ui/time-field';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { Text } from '@/components/ui/text';
import { can } from '@/features/organizations/permissions';
import { useRemoveFromWaitlist, useRoster, useSessionWaitlist, useStaffBookingMutations } from '@/features/bookings/queries';
import { useClassMutations, useOrganization, useSessions } from '@/features/organizations/queries';
import { formatMoney, formatTime, longDate } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

import { ConflictList } from './conflict-list';
import { DayStrip } from './schedule-form';
import { useClassContext } from './use-class-context';

type Edit = { date: string; time: string; roomId: string; instructorId: string; capacity: string };

/** Mover, cambiar de espacio/instructor/cupo o cancelar una sesión. */
export function SessionDetailScreen() {
  const t = useTheme();
  const { sessionId, date } = useLocalSearchParams<{ sessionId?: string; date?: string }>();
  const ctx = useClassContext();
  const day = date ?? '';
  const sessions = useSessions(ctx.activeId, day, day);
  const mut = useClassMutations(ctx.activeId ?? '');
  const roster = useRoster(ctx.activeId, sessionId);
  const waitlist = useSessionWaitlist(ctx.activeId, sessionId);
  const removeWait = useRemoveFromWaitlist(ctx.activeId ?? '');
  const orgDetail = useOrganization(ctx.activeId);
  const staff = useStaffBookingMutations(ctx.activeId ?? '', sessionId ?? '');
  const [edit, setEdit] = useState<Edit | null>(null);

  const s = sessions.data?.sessions.find((x) => x.id === sessionId);
  if (sessions.isPending || ctx.isLoading || !ctx.terms) {
    return (
      <FormScreen title="Sesión" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (sessions.isError) return <ErrorNotice fill what="la sesión" busy={sessions.isFetching} onRetry={sessions.refetch} />;
  if (!s) {
    return (
      <FormScreen title="Sesión" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No encontramos esta sesión.</Text>
      </FormScreen>
    );
  }

  const tz = sessions.data!.timezone;
  const canceled = s.status === 'CANCELED';
  const editable = can(ctx.org, 'session', 'update') && !canceled;
  const canCancel = can(ctx.org, 'session', 'delete') && !canceled;
  const v: Edit = edit ?? {
    date: s.date,
    time: formatTime(s.startsAt, tz),
    roomId: s.roomId ?? '',
    instructorId: s.instructorId ?? '',
    capacity: String(s.capacity),
  };
  const set = (p: Partial<Edit>) => setEdit({ ...v, ...p });
  const error = mut.updateSession.error ?? mut.cancelSession.error ?? undefined;

  const save = () => {
    if (!editable) return goBack();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) || !v.roomId) return done('Revisa la hora y el espacio.');
    mut.updateSession.mutate(
      {
        sessionId: s.id,
        date: v.date,
        startTime: v.time,
        roomId: v.roomId,
        instructorUserId: v.instructorId || null,
        capacity: parseInt(v.capacity, 10) || undefined,
      },
      { onSuccess: () => done('Sesión actualizada', goBack) }
    );
  };

  const cancel = (scope: 'one' | 'following') =>
    mut.cancelSession.mutate(
      { sessionId: s.id, scope },
      { onSuccess: (r) => done(r.canceled === 1 ? 'Sesión cancelada' : `${r.canceled} sesiones canceladas`, goBack) }
    );

  return (
    <FormScreen
      title={s.serviceName}
      subtitle={`${longDate(s.date)} · ${formatTime(s.startsAt, tz)}–${formatTime(s.endsAt, tz)} · ${formatMoney(s.priceCents, sessions.data!.currency)}`}
      cta={editable ? (mut.updateSession.isPending ? 'Guardando…' : 'Guardar cambios') : 'Listo'}
      onSubmit={save}
    >
      {canceled ? <InfoBanner icon={CalendarX2} tone="amber" text="Esta sesión está cancelada." /> : null}
      {!canceled && orgDetail.data && !orgDetail.data.isPublished ? (
        <Pressable onPress={() => router.push(orgDetail.data.verificationStatus === 'APPROVED' ? '/edit-academy' : '/verification')} className="active:opacity-80">
          <InfoBanner
            icon={EyeOff}
            tone="amber"
            text="Tu academia no está publicada: los alumnos no ven esta sesión en Descubrir. Toca para ver cómo publicarla."
          />
        </Pressable>
      ) : null}
      {s.seriesId && editable ? (
        <Pressable
          onPress={() => router.push({ pathname: '/edit-series', params: { seriesId: s.seriesId!, serviceId: s.serviceId } })}
          className="flex-row items-center justify-between rounded-2xl bg-card px-3.5 py-3 active:opacity-80"
        >
          <View className="flex-1 gap-0.5">
            <Text className="text-[13.5px] font-bold">Parte de un horario recurrente</Text>
            <Text className="text-[11.5px] text-muted-foreground">Cambiar días, hora o fechas de toda la serie</Text>
          </View>
          <Text className="text-xs font-bold text-primary">Editar</Text>
        </Pressable>
      ) : null}
      {can(ctx.org, 'attendance', 'update') && !canceled ? (
        <Button variant="secondary" onPress={() => router.push({ pathname: '/attendance', params: { sessionId: s.id } })}>
          <Icon as={ClipboardCheck} size={18} />
          <Text>Pasar lista</Text>
        </Button>
      ) : null}
      <View className="gap-2 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-bold">
            Reservas · {roster.data?.length ?? s.booked} de {s.capacity}
          </Text>
          {can(ctx.org, 'booking', 'create') && !canceled ? (
            <Pressable
              onPress={() => router.push({ pathname: '/add-to-roster', params: { sessionId: s.id } })}
              className="flex-row items-center gap-1 rounded-lg bg-primary-soft px-2.5 py-1.5 active:opacity-80"
            >
              <Icon as={UserPlus} size={14} color={t.primaryDark} />
              <Text className="text-xs font-bold text-primary-dark">Reservar por alumno</Text>
            </Pressable>
          ) : null}
        </View>
        {roster.data?.length === 0 ? <Text variant="muted">Aún no hay reservas.</Text> : null}
        {roster.data?.map((r, i) => (
          <View key={r.bookingId}>
            <View className="flex-row items-center gap-2.5 py-1.5">
              <View className="min-w-0 flex-1">
                <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                  {r.name}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  {r.source === 'STAFF' ? 'Reservó recepción' : 'Reservó en la app'}
                  {r.hasAccount ? '' : ' · sin cuenta'}
                </Text>
              </View>
              {can(ctx.org, 'booking', 'cancel') ? (
                <Pressable
                  onPress={() =>
                    staff.cancel.mutate(r.bookingId, { onSuccess: () => done('Reserva cancelada'), onError: (e) => done(e.message) })
                  }
                  className="h-8 w-8 items-center justify-center rounded-lg bg-muted active:opacity-70"
                >
                  <Icon as={X} size={15} color="#6B6270" />
                </Pressable>
              ) : null}
            </View>
            {i < roster.data.length - 1 ? <ListDivider /> : null}
          </View>
        ))}
      </View>

      {waitlist.data?.length ? (
        <View className="gap-2 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
          <Text className="text-sm font-bold">Lista de espera · {waitlist.data.length}</Text>
          <Text variant="muted" className="text-xs">
            Cuando se libera un lugar se aparta para la primera persona y se le avisa; si no lo toma a tiempo pasa a la siguiente.
          </Text>
          {waitlist.data.map((w, i) => (
            <View key={w.id}>
              <View className="flex-row items-center gap-2.5 py-1.5">
                <Text className="font-mono-bold w-5 text-[13px] text-muted-foreground">{w.position}</Text>
                <Avatar uri={w.image} name={w.name} size={32} />
                <View className="min-w-0 flex-1">
                  <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                    {w.name}
                  </Text>
                  {w.status === 'OFFERED' && w.offerExpiresAt ? (
                    <Text className="text-[11px] font-bold text-teal">Lugar apartado hasta las {formatTime(w.offerExpiresAt, tz)}</Text>
                  ) : null}
                </View>
                {can(ctx.org, 'booking', 'cancel') ? (
                  <Pressable
                    onPress={() => removeWait.mutate(w.id, { onSuccess: () => done('Quitado de la lista'), onError: (e) => done(e.message) })}
                    className="h-8 w-8 items-center justify-center rounded-lg bg-muted active:opacity-70"
                    accessibilityLabel={`Quitar a ${w.name} de la lista`}
                  >
                    <Icon as={X} size={15} color="#6B6270" />
                  </Pressable>
                ) : null}
              </View>
              {i < waitlist.data.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {editable ? (
        <>
          <FormGroup label="DÍA">
            <DayStrip value={v.date} onChange={(d) => set({ date: d })} tz={tz} days={28} />
          </FormGroup>
          <TimeField label="Hora de inicio" value={v.time} onChange={(time) => set({ time })} />
          <FormGroup label={ctx.terms.room.toUpperCase()}>
            <View className="flex-row flex-wrap gap-2">
              {ctx.rooms.map((r) => (
                <Chip key={r.id} label={`${r.name} · ${r.capacity}`} selected={v.roomId === r.id} onPress={() => set({ roomId: r.id })} />
              ))}
            </View>
          </FormGroup>
          <FormGroup label={ctx.terms.instructor.toUpperCase()}>
            <View className="flex-row flex-wrap gap-2">
              {ctx.instructors.map((i) => (
                <Chip
                  key={i.userId}
                  label={i.name}
                  selected={v.instructorId === i.userId}
                  onPress={() => set({ instructorId: i.userId })}
                />
              ))}
            </View>
          </FormGroup>
          <Field
            label="Cupo"
            value={v.capacity}
            onChangeText={(c) => set({ capacity: c.replace(/\D/g, '') })}
            keyboardType="number-pad"
            maxLength={5}
          />
        </>
      ) : (
        <View className="gap-1 rounded-[20px] bg-card p-3.5">
          <Text className="text-sm font-bold">{s.roomName ?? 'Sin espacio'}</Text>
          <Text variant="muted">{s.instructorName ?? 'Sin instructor asignado'}</Text>
        </View>
      )}

      <ConflictList error={error} roomTerm={ctx.terms.room} instructorTerm={ctx.terms.instructor} />

      {canCancel ? (
        <View className="gap-2 pt-1">
          <Button variant="outline" onPress={() => cancel('one')} loading={mut.cancelSession.isPending}>
            <Text className="text-sm font-bold text-destructive">Cancelar esta sesión</Text>
          </Button>
          {s.seriesId ? (
            <Button variant="outline" onPress={() => cancel('following')} loading={mut.cancelSession.isPending}>
              <Text className="text-sm font-bold text-destructive">Cancelar esta y las siguientes</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </FormScreen>
  );
}
