import { useLocalSearchParams } from 'expo-router';
import { Info, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { FormGroup, FormScreen } from '@/components/form-screen';
import { TimeZoneBanner } from '@/components/timezone';
import { Icon } from '@/components/ui/icon';
import { TimeField } from '@/components/ui/time-field';
import { Text } from '@/components/ui/text';
import { formatTime, localDateOf, longDate } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import { cn } from '@/lib/utils';

import { ConflictList } from './conflict-list';
import { DayStrip, WEEK } from './schedule-form';
import { useEditSeries, useSeries, useSeriesPreview, type SeriesBody, type SeriesError } from './series-queries';
import { useClassContext } from './use-class-context';

type Stage = 'edit' | 'blocked' | 'confirm';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Editar un horario recurrente. Se comparan los días resultantes con las sesiones que ya existen: las que coinciden no
 * se tocan, se crean las que faltan y se quitan las que sobran. Si alguna sesión por quitar ya tiene reservas, no se
 * guarda hasta que la persona confirme que acepta cancelarlas.
 */
export function EditSeriesScreen() {
  const { seriesId, serviceId } = useLocalSearchParams<{ seriesId?: string; serviceId?: string }>();
  const ctx = useClassContext();
  const list = useSeries(ctx.activeId, serviceId);
  const mut = useEditSeries(ctx.activeId ?? '', serviceId ?? '');
  const [edit, setEdit] = useState<Partial<SeriesBody>>({});
  const [stage, setStage] = useState<Stage>('edit');

  const series = list.data?.find((s) => s.id === seriesId);
  if (list.isPending || ctx.isLoading || !ctx.terms) {
    return (
      <FormScreen title="Editar horario" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (list.isError) return <ErrorNotice fill what="los horarios" busy={list.isFetching} onRetry={list.refetch} />;
  if (!series) {
    return (
      <FormScreen title="Editar horario" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">Este horario ya no existe o terminó.</Text>
      </FormScreen>
    );
  }

  const body: SeriesBody = {
    weekdays: edit.weekdays ?? series.weekdays,
    startDate: edit.startDate ?? series.startDate,
    endDate: edit.endDate ?? series.endDate,
    startTime: edit.startTime ?? series.startTime,
  };
  const set = (p: Partial<SeriesBody>) => {
    setEdit({ ...edit, ...p });
    setStage('edit');
    mut.reset();
  };
  const valid = body.weekdays.length > 0 && body.endDate >= body.startDate;
  const changed =
    JSON.stringify(body) !==
    JSON.stringify({ weekdays: series.weekdays, startDate: series.startDate, endDate: series.endDate, startTime: series.startTime });

  return (
    <Body series={series} body={body} set={set} valid={valid} changed={changed} stage={stage} setStage={setStage} mut={mut} ctx={ctx} />
  );
}

type BodyProps = {
  series: NonNullable<ReturnType<typeof useSeries>['data']>[number];
  body: SeriesBody;
  set: (p: Partial<SeriesBody>) => void;
  valid: boolean;
  changed: boolean;
  stage: Stage;
  setStage: (s: Stage) => void;
  mut: ReturnType<typeof useEditSeries>;
  ctx: ReturnType<typeof useClassContext>;
};

function Body({ series, body, set, valid, changed, stage, setStage, mut, ctx }: BodyProps) {
  const t = useTheme();
  const preview = useSeriesPreview(ctx.activeId, series.id, valid && changed ? body : null);
  const sum = preview.data;
  const err = mut.error as SeriesError | null;
  const blocked = stage !== 'edit' ? (err?.summary ?? sum) : null;
  const affected = blocked?.withBookings ?? [];
  const when = (v: number | string | Date) => `${longDate(localDateOf(+new Date(v), ctx.tz))} · ${formatTime(v, ctx.tz)}`;

  const save = (force: boolean) =>
    mut.mutate(
      { seriesId: series.id, body, force },
      {
        onSuccess: (r) =>
          done(
            `Horario actualizado · +${r.added} ${r.added === 1 ? 'sesión' : 'sesiones'}, −${r.removed}${r.bookingsCanceled ? ` · ${plural(r.bookingsCanceled, 'reserva cancelada', 'reservas canceladas')}` : ''}`,
            goBack
          ),
        onError: (e) => {
          if ((e as SeriesError).code === 'HAS_BOOKINGS') setStage('blocked');
        },
      }
    );

  const onSubmit = () => {
    if (!valid) return done('Elige al menos un día y una fecha final válida.');
    if (!changed) return goBack();
    if (stage === 'blocked') return setStage('confirm');
    save(stage === 'confirm');
  };

  const cta = mut.isPending
    ? 'Guardando…'
    : stage === 'blocked'
      ? 'Editar de todas formas'
      : stage === 'confirm'
        ? 'Sí, cancelar reservas y guardar'
        : changed
          ? 'Guardar cambios'
          : 'Listo';

  return (
    <FormScreen
      title="Editar horario"
      subtitle={`${WEEK.filter((w) => series.weekdays.includes(w.d))
        .map((w) => w.l)
        .join(' · ')} · ${series.startTime}`}
      cta={cta}
      ctaVariant={stage === 'edit' ? 'default' : 'destructive'}
      onSubmit={onSubmit}
      secondary={
        stage === 'edit' ? undefined : { label: stage === 'confirm' ? 'No, volver' : 'Volver a editar', onPress: () => setStage('edit') }
      }
    >
      <TimeZoneBanner tz={ctx.tz} />
      <FormGroup label="DÍAS DE LA SEMANA">
        <View className="flex-row gap-[5px]">
          {WEEK.map((w) => {
            const on = body.weekdays.includes(w.d);
            return (
              <Pressable
                key={w.d}
                onPress={() => set({ weekdays: on ? body.weekdays.filter((x) => x !== w.d) : [...body.weekdays, w.d] })}
                className={cn('h-10 flex-1 items-center justify-center rounded-xl', on ? 'bg-primary' : 'bg-card')}
              >
                <Text className={cn('text-[13.5px] font-extrabold', on ? 'text-white' : 'text-muted-foreground')}>{w.l}</Text>
              </Pressable>
            );
          })}
        </View>
      </FormGroup>

      <TimeField label="Hora de inicio" value={body.startTime} onChange={(startTime) => set({ startTime })} />

      <FormGroup label="PRIMER DÍA">
        <Text variant="muted" className="-mt-1 text-xs">
          Actual: {longDate(series.startDate)}. Los días que ya pasaron nunca se modifican.
        </Text>
        <DayStrip value={body.startDate} onChange={(startDate) => set({ startDate })} tz={ctx.tz} days={60} />
      </FormGroup>

      <FormGroup label="ÚLTIMO DÍA">
        <Text variant="muted" className="-mt-1 text-xs">
          Actual: {longDate(body.endDate)}.
        </Text>
        <DayStrip value={body.endDate} onChange={(endDate) => set({ endDate })} tz={ctx.tz} days={120} />
      </FormGroup>

      {/* Resumen de lo que pasaría al guardar. */}
      {changed && valid && stage === 'edit' ? (
        <View className="gap-1 rounded-[20px] bg-primary-soft p-3.5">
          <View className="flex-row items-center gap-2">
            {preview.isFetching ? <ActivityIndicator size="small" /> : <Icon as={Info} size={16} color={t.primaryDark} />}
            <Text className="flex-1 text-[13px] font-bold text-primary-dark">
              {sum
                ? `Se crearán ${plural(sum.add, 'sesión nueva', 'sesiones nuevas')} y se quitarán ${plural(sum.remove, 'sesión', 'sesiones')}`
                : 'Calculando cambios…'}
            </Text>
          </View>
          <Text className="text-xs text-primary-ink">Las sesiones que ya existen y no cambian se quedan igual, con sus reservas.</Text>
          {sum && sum.withBookings.length > 0 ? (
            <Text className="text-xs font-bold text-destructive">
              ⚠ {plural(sum.withBookings.length, 'sesión que se quitaría tiene', 'sesiones que se quitarían tienen')} reservas (
              {sum.bookingsAffected}). Para guardar tendrás que confirmarlo.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Bloqueo: hay reservas en sesiones que se quitarían. */}
      {stage !== 'edit' ? (
        <View className="gap-2 rounded-[20px] bg-[#FDE8E6] p-3.5">
          <View className="flex-row items-center gap-2">
            <Icon as={TriangleAlert} size={17} color="#D92D20" />
            <Text className="flex-1 text-[13.5px] font-extrabold text-destructive">
              {stage === 'blocked' ? 'No se puede cambiar sin cancelar reservas' : 'Confirma los cambios'}
            </Text>
          </View>
          <Text className="text-[12.5px] leading-[18px] text-[#7A271A]">
            {stage === 'blocked'
              ? `${plural(affected.length, 'sesión', 'sesiones')} que se quitaría${affected.length === 1 ? '' : 'n'} con este cambio ya tiene${affected.length === 1 ? '' : 'n'} reservas de alumnos (${blocked?.bookingsAffected ?? 0} en total).`
              : `Esto cancelará ${plural(blocked?.bookingsAffected ?? 0, 'reserva', 'reservas')} en ${plural(affected.length, 'clase', 'clases')}. Cada persona conserva su clase: sus créditos no se descuentan, así que podrá reservar otra cuando quiera. Si pagó en línea, el pago queda como crédito a su favor y no se reembolsa. Esta acción no se puede deshacer.`}
          </Text>
          {affected.slice(0, 6).map((a) => (
            <Text key={a.sessionId} className="text-xs text-[#7A271A]">
              • {when(a.startsAt)} — {plural(a.bookings, 'reserva', 'reservas')}
            </Text>
          ))}
          {affected.length > 6 ? <Text className="text-xs text-[#7A271A]">y {affected.length - 6} más…</Text> : null}
        </View>
      ) : null}

      <ConflictList error={err && !err.summary ? err : undefined} roomTerm={ctx.terms!.room} instructorTerm={ctx.terms!.instructor} />
      <Text variant="muted" className="text-xs">
        {series.roomName ? `${series.roomName}` : ''}
        {series.instructorName ? ` · ${series.instructorName}` : ''} · cupo {series.capacity}. Para cambiar el espacio, quién imparte o el
        cupo de una sesión, ábrela desde la agenda.
      </Text>
    </FormScreen>
  );
}
