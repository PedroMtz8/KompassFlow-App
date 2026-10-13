import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { FormGroup, FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useCatalog } from '@/features/interests/queries';
import { can } from '@/features/organizations/permissions';
import { useClassMutations, useServices } from '@/features/organizations/queries';
import { longDate } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

import { kindLabel, levelLabel, type Kind, type Level } from './class-labels';
import { WEEK } from './schedule-form';
import { useSeries } from './series-queries';
import { useClassContext } from './use-class-context';

type Form = { name: string; kind: Kind; level: Level; disciplineId?: string; price: string; duration: string; active: boolean };

/** Editar un servicio: datos, disciplina y si está activo (los inactivos no se pueden programar). */
export function EditServiceScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const ctx = useClassContext();
  const services = useServices(ctx.activeId);
  const catalog = useCatalog();
  const mut = useClassMutations(ctx.activeId ?? '');
  const series = useSeries(ctx.activeId, serviceId);
  const [form, setForm] = useState<Form | null>(null);

  const svc = services.data?.find((s) => s.id === serviceId);
  if (services.isPending || !ctx.terms) {
    return (
      <FormScreen title="Editar" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (services.isError) return <ErrorNotice fill what="la clase" busy={services.isFetching} onRetry={services.refetch} />;
  if (!svc) {
    return (
      <FormScreen title="Editar" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No encontramos este servicio.</Text>
      </FormScreen>
    );
  }

  const v: Form = form ?? {
    name: svc.name,
    kind: svc.kind,
    level: svc.level,
    disciplineId: svc.disciplineId ?? undefined,
    price: String(svc.priceCents / 100),
    duration: String(svc.durationMin),
    active: svc.isActive,
  };
  const set = (p: Partial<Form>) => setForm({ ...v, ...p });
  const editable = can(ctx.org, 'service', 'update');
  const canSchedule = can(ctx.org, 'session', 'create') && v.active;
  const disciplines = catalog.data?.find((x) => x.id === ctx.verticalId)?.disciplines ?? [];
  const price = parseFloat(v.price.replace(',', '.'));
  const dur = parseInt(v.duration, 10);

  const save = () => {
    if (!editable) return goBack();
    if (v.name.trim().length < 2 || Number.isNaN(price) || price < 0 || !(dur >= 10 && dur <= 600))
      return done('Revisa el nombre, el precio y la duración.');
    mut.updateService.mutate(
      {
        serviceId: svc.id,
        name: v.name,
        kind: v.kind,
        level: v.level,
        disciplineId: v.disciplineId,
        priceCents: Math.round(price * 100),
        durationMin: dur,
        isActive: v.active,
      },
      { onSuccess: () => done('Cambios guardados', goBack), onError: (e) => done(e.message) }
    );
  };

  return (
    <FormScreen title={svc.name} subtitle="Editar servicio" cta={editable ? 'Guardar cambios' : 'Listo'} onSubmit={save}>
      <Field label="Nombre" value={v.name} onChangeText={(name) => set({ name })} maxLength={80} editable={editable} />
      <FormGroup label="TIPO">
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(kindLabel) as Kind[]).map((k) => (
            <Chip key={k} label={kindLabel[k]} selected={v.kind === k} onPress={() => editable && set({ kind: k })} />
          ))}
        </View>
      </FormGroup>
      {disciplines.length ? (
        <FormGroup label="DISCIPLINA">
          <View className="flex-row flex-wrap gap-2">
            {disciplines.map((d) => (
              <Chip key={d.id} label={d.name} selected={v.disciplineId === d.id} onPress={() => editable && set({ disciplineId: d.id })} />
            ))}
          </View>
        </FormGroup>
      ) : null}
      <FormGroup label="NIVEL">
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(levelLabel) as Level[]).map((l) => (
            <Chip key={l} label={levelLabel[l]} selected={v.level === l} onPress={() => editable && set({ level: l })} />
          ))}
        </View>
      </FormGroup>
      <View className="flex-row gap-2.5">
        <Field
          label={`Precio (${ctx.currency})`}
          value={v.price}
          onChangeText={(p) => set({ price: p.replace(/[^\d.,]/g, '') })}
          keyboardType="decimal-pad"
          containerClassName="flex-1"
          editable={editable}
          maxLength={9}
        />
        <Field
          label="Duración (min)"
          value={v.duration}
          onChangeText={(d) => set({ duration: d.replace(/\D/g, '') })}
          keyboardType="number-pad"
          containerClassName="flex-1"
          editable={editable}
          maxLength={3}
        />
      </View>
      <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[13.5px] font-bold">Activo</Text>
          <Text className="text-[11.5px] text-muted-foreground">Los servicios inactivos no se pueden programar ni reservar</Text>
        </View>
        <Toggle value={v.active} onValueChange={(active) => editable && set({ active })} />
      </View>
      {series.data?.length ? (
        <FormGroup label="HORARIOS RECURRENTES">
          <View className="gap-2">
            {series.data.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => canSchedule && router.push({ pathname: '/edit-series', params: { seriesId: s.id, serviceId: svc.id } })}
                className="gap-0.5 rounded-2xl bg-card px-3.5 py-3 active:opacity-80"
              >
                <Text className="text-[14px] font-bold">
                  {WEEK.filter((w) => s.weekdays.includes(w.d))
                    .map((w) => w.l)
                    .join(' · ')}{' '}
                  · {s.startTime}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {longDate(s.startDate)} → {longDate(s.endDate)} · {s.upcoming} {s.upcoming === 1 ? 'sesión próxima' : 'sesiones próximas'}
                  {s.upcomingBookings ? ` · ${s.upcomingBookings} ${s.upcomingBookings === 1 ? 'reserva' : 'reservas'}` : ''}
                </Text>
                {canSchedule ? <Text className="pt-0.5 text-xs font-bold text-primary">Editar horario</Text> : null}
              </Pressable>
            ))}
          </View>
        </FormGroup>
      ) : null}
      {canSchedule ? (
        <View className="gap-1.5">
          <Button variant="soft" onPress={() => router.push({ pathname: '/schedule-sessions', params: { serviceId: svc.id } })}>
            <Text>Agregar otro horario</Text>
          </Button>
          <Text variant="muted" className="text-xs">
            Agrega un horario recurrente adicional a esta misma clase (por ejemplo, otro día u otra hora). No cambia los que ya tienes.
          </Text>
        </View>
      ) : null}
    </FormScreen>
  );
}
