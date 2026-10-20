import { router, useLocalSearchParams } from 'expo-router';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import Banknote from 'lucide-react-native/icons/banknote';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import Check from 'lucide-react-native/icons/check';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { barShade, useTheme } from '@/lib/theme';
import { FormScreen } from '@/components/form-screen';
import { useCash, useCloseCash, useRefundPayment } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAccountMutations } from '@/features/accounts/queries';
import { PassPeople } from '@/features/payments/pass-people';
import { Field } from '@/components/ui/field';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { TimeField } from '@/components/ui/time-field';
import { ListDivider } from '@/components/ui/list-divider';
import { MoneyCard } from '@/components/ui/money-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Segmented } from '@/components/ui/segmented';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { MiniStat } from '@/components/ui/tinted-stat';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { done } from '@/lib/simulate';
import {
  useAvailability,
  useReportSummary,
  useSaveAvailability,
  useRoster,
  useStaffBookingMutations,
  useStudent,
  useStudents,
} from '@/features/bookings/queries';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization, useOrganization } from '@/features/organizations/queries';
import type { Tone } from '@/lib/tones';
import { goBack } from '@/lib/nav';

/** Corte de caja: lo que el sistema espera de efectivo contra lo que se contó. */
export function CloseCashScreen() {
  const { activeId, org } = useActiveOrganization();
  const cash = useCash(activeId);
  const close = useCloseCash(activeId ?? '');
  const [counted, setCounted] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (cash.isPending) {
    return (
      <FormScreen title="Corte de caja" cta="Cerrar caja" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  const c = cash.data;
  if (!c) {
    return (
      <FormScreen title="Corte de caja" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No pudimos cargar la caja.</Text>
      </FormScreen>
    );
  }
  const money = (cents: number) => formatMoney(cents, c.currency);
  const countedStr = counted ?? String(c.expectedCents / 100);
  const countedNum = parseFloat(countedStr.replace(',', '.'));
  const countedCents = Number.isNaN(countedNum) ? 0 : Math.round(countedNum * 100);
  const diff = countedCents - c.expectedCents;

  return (
    <FormScreen
      title="Corte de caja"
      subtitle={`Efectivo · ${org?.name ?? ''}`}
      cta={close.isPending ? 'Cerrando…' : 'Cerrar caja'}
      loading={close.isPending}
      onSubmit={() => {
        if (Number.isNaN(countedNum) || countedNum < 0) return done('Indica el efectivo contado.');
        close.mutate(
          { countedCents, note: note || undefined },
          {
            onSuccess: (r) =>
              done(
                r.differenceCents === 0 ? 'Caja cerrada · sin diferencia' : `Caja cerrada · diferencia ${money(r.differenceCents)}`,
                () => goBack()
              ),
            onError: (e) => done(e.message),
          }
        );
      }}
    >
      <MoneyCard
        label="Efectivo esperado"
        amount={money(c.expectedCents)}
        caption={
          c.lastClose
            ? `Desde el último corte (${new Date(c.lastClose.closedAt).toLocaleDateString('es-MX')})`
            : 'Según los pagos en efectivo registrados'
        }
      />
      {c.lines.length ? (
        <View className="gap-1 rounded-[22px] bg-card px-3.5 py-1 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
          {c.lines.map((l, i) => (
            <View key={l.id}>
              <View className="flex-row items-center justify-between gap-2 py-2.5">
                <Text className="flex-1 text-[13.5px] font-semibold" numberOfLines={1}>
                  {l.studentName} · {l.concept}
                </Text>
                <Text className="font-mono-bold text-[13px]">{money(l.amountCents)}</Text>
              </View>
              {i < c.lines.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text variant="muted">No hay pagos en efectivo por cerrar.</Text>
      )}
      <Field
        label={`Efectivo contado (${c.currency})`}
        value={countedStr}
        onChangeText={(v) => setCounted(v.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        maxLength={9}
      />
      {diff !== 0 ? (
        <Text className={`text-[13px] font-bold ${diff < 0 ? 'text-destructive' : 'text-teal'}`}>
          {diff < 0 ? 'Faltan' : 'Sobran'} {money(Math.abs(diff))}
        </Text>
      ) : null}
      <Field label="Notas (opcional)" value={note} onChangeText={setNote} placeholder="Diferencias, observaciones…" maxLength={300} />
    </FormScreen>
  );
}

/** Reservar a un alumno de la organización en una sesión (recepción). El servidor valida el cupo. */
export function AddToRosterScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const [q, setQ] = useState('');
  const students = useStudents(activeId, q.trim() || undefined);
  const roster = useRoster(activeId, sessionId);
  const mut = useStaffBookingMutations(activeId ?? '', sessionId ?? '');
  const inside = new Set(roster.data?.map((r) => r.studentId));

  return (
    <Screen>
      <ScreenHeader title="Reservar por un alumno" subtitle={org?.name} />
      <ScreenScroll contentContainerClassName="gap-2.5">
        <Input value={q} onChangeText={setQ} placeholder="Buscar alumno" className="h-12" />
        <QueryStatus q={students} />
        {students.data?.length === 0 ? (
          <Text variant="muted">
            {q ? 'Sin resultados.' : 'Aún no hay alumnos.'}{' '}
            <Text className="text-xs font-bold text-primary" onPress={() => router.push('/new-student')}>
              Dar de alta
            </Text>
          </Text>
        ) : null}
        {students.data?.map((st, i) => {
          const booked = inside.has(st.id);
          return (
            <View key={st.id}>
              <View className="flex-row items-center gap-[11px] py-2">
                <Avatar uri={st.image} name={st.name} size={40} />
                <View className="min-w-0 flex-1 gap-[3px]">
                  <Text className="text-sm font-bold" numberOfLines={1}>
                    {st.name}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                    {st.phone ?? st.email ?? 'Sin contacto'}
                  </Text>
                </View>
                <Pressable
                  disabled={booked || mut.book.isPending}
                  onPress={() => mut.book.mutate(st.id, { onSuccess: () => done(`${st.name} reservado`), onError: (e) => done(e.message) })}
                  className={
                    booked
                      ? 'h-9 w-9 items-center justify-center rounded-xl bg-teal'
                      : 'h-9 w-9 items-center justify-center rounded-xl bg-muted active:opacity-80'
                  }
                >
                  <Icon as={booked ? Check : UserPlus} size={17} color={booked ? '#fff' : '#4A4152'} />
                </Pressable>
              </View>
              {i < (students.data?.length ?? 0) - 1 ? <ListDivider /> : null}
            </View>
          );
        })}
      </ScreenScroll>
      <FooterBar>
        <Button variant="dark" size="lg" onPress={goBack}>
          <Text className="text-[15.5px]">Listo</Text>
        </Button>
      </FooterBar>
    </Screen>
  );
}

/** Disponibilidad semanal de quien imparte privadas: de aquí salen los horarios que ven los alumnos. */
const DAYS = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
];
type Day = { on: boolean; start: string; end: string };

export function AvailabilityScreen() {
  const { activeId, org } = useActiveOrganization();
  const q = useAvailability(activeId);
  const save = useSaveAvailability(activeId ?? '');
  const [edits, setEdits] = useState<Record<number, Day>>({});

  if (q.isPending) {
    return (
      <FormScreen title="Disponibilidad" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  const saved = (wd: number): Day => {
    const w = q.data?.find((x) => x.weekday === wd);
    return w ? { on: true, start: w.startTime, end: w.endTime } : { on: false, start: '10:00', end: '14:00' };
  };
  const get = (wd: number) => edits[wd] ?? saved(wd);
  const set = (wd: number, p: Partial<Day>) => setEdits((e) => ({ ...e, [wd]: { ...get(wd), ...p } }));

  const submit = () => {
    const windows = DAYS.filter((d) => get(d.weekday).on).map((d) => ({
      weekday: d.weekday,
      startTime: get(d.weekday).start,
      endTime: get(d.weekday).end,
    }));
    save.mutate(windows, {
      onSuccess: () => done('Disponibilidad guardada', () => goBack()),
      onError: (e) => done(e.message),
    });
  };

  return (
    <FormScreen
      title="Disponibilidad"
      subtitle={`Clases privadas · ${org?.name ?? ''}`}
      cta={save.isPending ? 'Guardando…' : 'Guardar disponibilidad'}
      onSubmit={submit}
    >
      <View className="rounded-[22px] bg-card px-3.5 py-1 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
        {DAYS.map((d, i) => {
          const v = get(d.weekday);
          return (
            <View key={d.weekday}>
              <View className="flex-row items-center gap-3 py-3">
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-bold">{d.label}</Text>
                  {v.on ? (
                    <View className="flex-row items-center gap-2">
                      <TimeField value={v.start} onChange={(start) => set(d.weekday, { start })} className="h-10 w-[104px]" />
                      <Text className="text-muted-foreground">a</Text>
                      <TimeField value={v.end} onChange={(end) => set(d.weekday, { end })} className="h-10 w-[104px]" />
                    </View>
                  ) : (
                    <Text className="font-mono text-xs text-subtle">No disponible</Text>
                  )}
                </View>
                <Toggle value={v.on} onValueChange={(on) => set(d.weekday, { on })} />
              </View>
              {i < DAYS.length - 1 ? <ListDivider /> : null}
            </View>
          );
        })}
      </View>
      <Text variant="muted" className="text-xs">
        Horas en formato 24 h (por ejemplo 16:30). Los alumnos reservan bloques de la duración de tu clase privada dentro de estos horarios,
        con el descanso que configuraste.
      </Text>
    </FormScreen>
  );
}

/** Detalle de un alumno: datos de contacto e historial de reservas. */
/** Reembolso de un pago con tarjeta: pide un segundo toque para confirmar (devuelve el dinero y vence el pase). */
function RefundButton({ orgId, paymentId }: { orgId: string; paymentId: string }) {
  const refund = useRefundPayment(orgId);
  const [sure, setSure] = useState(false);
  return (
    <Pressable
      disabled={refund.isPending}
      onPress={() =>
        sure
          ? refund.mutate(paymentId, { onSuccess: () => done('Pago reembolsado'), onError: (e) => done(e.message), onSettled: () => setSure(false) })
          : setSure(true)
      }
      hitSlop={6}
      className="active:opacity-70"
    >
      <Text className="text-[11.5px] font-bold text-destructive">
        {refund.isPending ? 'Reembolsando…' : sure ? 'Toca otra vez para confirmar' : 'Reembolsar'}
      </Text>
    </Pressable>
  );
}

export function StudentDetailScreen() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const q = useStudent(activeId, studentId);
  const st = q.data;
  const accounts = useAccountMutations(activeId ?? '', org?.name);
  const currency = useOrganization(activeId).data?.currency ?? 'MXN';

  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Alumno" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!st) {
    return (
      <Screen>
        <ScreenHeader title="Alumno" />
        <ScreenScroll>
          <Text variant="muted">No encontramos a este alumno.</Text>
        </ScreenScroll>
      </Screen>
    );
  }
  const taken = st.history.filter((h) => h.attendance === 'PRESENT').length;
  const missed = st.history.filter((h) => h.attendance === 'ABSENT').length;
  const canceled = st.history.filter((h) => h.status === 'CANCELED').length;

  return (
    <Screen>
      <ScreenHeader title={st.name} subtitle={[st.phone, st.email].filter(Boolean).join(' · ') || (can(org, 'student', 'read_contact') ? 'Sin datos de contacto' : 'Contacto reservado a recepción y administración')} />
      <ScreenScroll contentContainerClassName="gap-3">
        <View className="flex-row gap-2">
          <MiniStat value={String(taken)} label="asistencias" tone="teal" />
          <MiniStat value={String(missed)} label="faltas" tone="orange" />
          <MiniStat value={String(canceled)} label="canceladas" tone="violet" />
        </View>
        {st.pendingActivation && st.accountUserId ? (
          <View className="gap-2 rounded-[20px] bg-amber-soft px-3.5 py-3">
            <Text className="text-[13px] font-bold text-amber-ink">
              Cuenta por activar: aún no cambia su contraseña temporal. Si la perdió o caducó, genera otra.
            </Text>
            {can(org, 'student', 'create') ? (
              <Button
                size="sm"
                variant="dark"
                loading={accounts.reset.isPending}
                onPress={() =>
                  accounts.reset.mutate(
                    { userId: st.accountUserId!, name: st.name },
                    { onSuccess: () => router.push('/account-created' as never), onError: (e) => done(e.message) }
                  )
                }
              >
                <Text>Regenerar contraseña temporal</Text>
              </Button>
            ) : null}
          </View>
        ) : null}
        {!st.hasAccount ? (
          <View className="gap-2 rounded-[20px] bg-amber-soft px-3.5 py-3">
            <Text className="text-[13px] font-bold text-amber-ink">
              Sin cuenta: vincúlalo con un código para que su historial pase a su cuenta.
            </Text>
            {can(org, 'student', 'update') ? (
              <Button size="sm" variant="dark" onPress={() => router.push({ pathname: '/link-account', params: { studentId: st.id } })}>
                <Text>Vincular cuenta</Text>
              </Button>
            ) : null}
          </View>
        ) : null}
        {st.passes.length ? (
          <>
            <SectionHeader title="Paquetes y membresías" />
            <View className="-mt-1.5 gap-2">
              {st.passes.map((p) => (
                <View key={p.id} className="gap-2.5 rounded-2xl bg-card px-3.5 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="min-w-0 flex-1 gap-[3px]">
                    <Text className="text-sm font-bold" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[11.5px] text-muted-foreground">
                      {p.expiresAt
                        ? `Vence ${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(p.expiresAt))}`
                        : 'Sin vencimiento'}
                    </Text>
                  </View>
                  <Badge tone={p.active ? 'teal' : 'ink'}>
                    {p.creditsTotal == null
                      ? p.active
                        ? 'ILIMITADA'
                        : 'VENCIDA'
                      : p.active
                        ? `${p.remaining} DE ${p.creditsTotal}`
                        : p.remaining === 0
                          ? 'AGOTADO'
                          : 'VENCIDO'}
                  </Badge>
                </View>
                {p.seats > 1 ? (
                  <PassPeople
                    orgId={activeId ?? ''}
                    passId={p.id}
                    members={p.members}
                    seats={p.seats}
                    vacant={p.vacant}
                    unlimited={p.creditsTotal == null}
                    canEdit={can(org, 'payment', 'update')}
                  />
                ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
        {st.payments.length ? (
          <>
            <SectionHeader title="Pagos" />
            <View className="-mt-1.5">
              {st.payments.map((p, i) => (
                <View key={p.id}>
                  <View className="flex-row items-center justify-between py-[9px]">
                    <View className="gap-[3px]">
                      <Text className="text-sm font-bold">{p.concept}</Text>
                      <Text className="text-[11.5px] text-muted-foreground">
                        {new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(p.paidAt ?? p.createdAt))} ·{' '}
                        {p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : 'Otro'}
                        {p.status === 'PENDING'
                          ? ' · por confirmar'
                          : p.status === 'REJECTED'
                            ? ' · rechazado'
                            : p.status === 'REFUNDED'
                              ? ' · reembolsado'
                              : ''}
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-mono-bold text-[13px]">{formatMoney(p.amountCents, currency)}</Text>
                      {activeId && p.method === 'CARD' && p.status === 'PAID' && can(org, 'payment', 'refund') ? (
                        <RefundButton orgId={activeId} paymentId={p.id} />
                      ) : null}
                    </View>
                  </View>
                  {i < st.payments.length - 1 ? <ListDivider /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
        <SectionHeader title="Historial de reservas" />
        <View className="-mt-1.5">
          {st.history.length === 0 ? <Text variant="muted">Aún no tiene reservas.</Text> : null}
          {st.history.map((h, i) => (
            <View key={h.id}>
              <View className="flex-row items-center justify-between py-[9px]">
                <View className="gap-[3px]">
                  <Text className="text-sm font-bold">{h.serviceName}</Text>
                  <Text className="text-[11.5px] text-muted-foreground">
                    {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mazatlan' }).format(
                      h.startsAt
                    )}
                    {h.source === 'STAFF' ? ' · en recepción' : ''}
                  </Text>
                </View>
                <Badge
                  tone={
                    h.status === 'CANCELED' ? 'ink' : h.attendance === 'PRESENT' ? 'teal' : h.attendance === 'ABSENT' ? 'pink' : 'amber'
                  }
                >
                  {h.status === 'CANCELED'
                    ? 'CANCELADA'
                    : h.attendance === 'PRESENT'
                      ? 'ASISTIÓ'
                      : h.attendance === 'ABSENT'
                        ? 'FALTÓ'
                        : 'RESERVADA'}
                </Badge>
              </View>
              {i < st.history.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
      </ScreenScroll>
      {can(org, 'payment', 'create') ? (
        <FooterBar>
          <Button size="lg" onPress={() => router.push({ pathname: '/register-payment', params: { studentId: st.id } })}>
            <Icon as={Banknote} size={18} color="#fff" />
            <Text className="text-[15.5px]">Registrar pago</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}

/** Reportes básicos: asistencia y ocupación reales de los últimos días. */
export function ReportsScreen() {
  const t = useTheme();
  const { activeId } = useActiveOrganization();
  const [days, setDays] = useState(30);
  const r = useReportSummary(activeId, days);
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const tones: Tone[] = ['orange', 'pink', 'amber', 'violet', 'teal', 'blue'];

  return (
    <Screen>
      <ScreenHeader title="Reportes" subtitle={`Últimos ${days} días`} />
      <ScreenScroll contentContainerClassName="gap-3">
        <Segmented
          options={[
            { value: '7', label: '7 días' },
            { value: '30', label: '30 días' },
            { value: '90', label: '90 días' },
          ]}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />
        <QueryStatus q={r} />
        {r.data ? (
          <>
            <StatCard
              title="Resumen"
              icon={BarChart3}
              tone="blue"
              stats={[
                { value: String(r.data.attended), label: 'asistencias' },
                { value: pct(r.data.occupancy), label: 'ocupación' },
                { value: pct(r.data.attendanceRate), label: 'asistencia' },
              ]}
            />
            {r.data.sessions === 0 ? <Text variant="muted">Aún no hay clases impartidas en este periodo.</Text> : null}
            <View className="gap-3 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
              <View className="flex-row items-center justify-between">
                <Text variant="overline">Ocupación por día</Text>
                <Icon as={ArrowUpRight} size={16} color={t.teal} />
              </View>
              <View className="h-20 flex-row items-end gap-2">
                {r.data.weekdays.map((w, i) => (
                  <View key={w.label} className="flex-1 items-center gap-1.5" style={{ height: '100%', justifyContent: 'flex-end' }}>
                    <View
                      className="w-full rounded-t-md"
                      style={{ height: `${Math.max((Number.isFinite(w.occupancy) ? w.occupancy : 0) * 100, w.sessions ? 4 : 0)}%`, backgroundColor: barShade(t, i, 7) }}
                    />
                  </View>
                ))}
              </View>
              <View className="flex-row gap-2">
                {r.data.weekdays.map((w) => (
                  <Text key={w.label} className="flex-1 text-center text-[11px] font-bold text-muted-foreground">
                    {w.label}
                  </Text>
                ))}
              </View>
            </View>
            {r.data.topServices.length ? <SectionHeader title="Clases con más ocupación" /> : null}
            {r.data.topServices.map((c, i) => (
              <View key={c.id} className="gap-1.5">
                <View className="flex-row justify-between">
                  <Text className="text-[13px] font-bold">{c.name}</Text>
                  <Text className="font-mono-bold text-xs text-muted-foreground">{pct(c.occupancy)}</Text>
                </View>
                <ProgressBar value={c.occupancy} tone={tones[i % tones.length]} height={7} />
              </View>
            ))}
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
