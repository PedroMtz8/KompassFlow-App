import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FormGroup, FormScreen } from '@/components/form-screen';
import { TimeZoneBanner } from '@/components/timezone';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useCatalog } from '@/features/interests/queries';
import { useClassMutations } from '@/features/organizations/queries';
import { authClient } from '@/lib/auth-client';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import Repeat from 'lucide-react-native/icons/repeat';

import { kindLabel, levelLabel, type Kind, type Level } from './class-labels';
import { ConflictList } from './conflict-list';
import { initialSchedule, ScheduleFields, scheduleIsValid, sessionCount, toScheduleBody, type ScheduleState } from './schedule-form';
import { useClassContext } from './use-class-context';

/** Crea el servicio (qué se vende) y programa sus sesiones (cuándo) en un solo paso. */
export function NewClassScreen() {
  const ctx = useClassContext();
  const catalog = useCatalog();
  const { data: session } = authClient.useSession();
  const mut = useClassMutations(ctx.activeId ?? '');

  const [kind, setKind] = useState<Kind>('GROUP');
  const [name, setName] = useState('');
  const [disciplineId, setDisciplineId] = useState<string>();
  const [level, setLevel] = useState<Level>('ALL');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('60');
  const [sched, setSched] = useState<ScheduleState | null>(null);
  const [buffer, setBuffer] = useState('15');
  const [teacher, setTeacher] = useState<string>();

  if (ctx.isLoading || !ctx.terms) {
    return (
      <FormScreen title="Nueva clase" cta="Crear" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }

  const term = ctx.terms.session.toLowerCase();
  const disciplines = catalog.data?.find((v) => v.id === ctx.verticalId)?.disciplines ?? [];
  const schedule = sched ?? initialSchedule(ctx.rooms, ctx.instructors, session?.user.id, ctx.tz);
  const setSchedule = (s: ScheduleState) => setSched(s);
  const priceNum = price === '' ? 0 : parseFloat(price.replace(',', '.'));
  const dur = parseInt(duration, 10);
  const isPrivate = kind === 'PRIVATE';
  const valid =
    name.trim().length >= 2 &&
    !Number.isNaN(priceNum) &&
    priceNum >= 0 &&
    dur >= 10 &&
    dur <= 600 &&
    (isPrivate || scheduleIsValid(schedule));
  const n = sessionCount(schedule);

  const submit = () => {
    if (!valid) return done('Completa el nombre, la duración y el horario.');
    mut.createService.mutate(
      {
        name,
        kind,
        disciplineId,
        level,
        priceCents: Math.round(priceNum * 100),
        durationMin: dur,
        ...(isPrivate
          ? { instructorUserId: teacher ?? session?.user.id, bufferMin: Math.min(parseInt(buffer, 10) || 0, 120) }
          : { schedule: toScheduleBody(schedule) }),
      },
      {
        onSuccess: (r) =>
          isPrivate
            ? done('Privada creada. Define tu disponibilidad para que puedan reservarla.', () => router.replace('/availability'))
            : done(`${r.sessions} ${r.sessions === 1 ? 'sesión creada' : 'sesiones creadas'}`, goBack),
      }
    );
  };

  return (
    <FormScreen
      title={`Nueva ${term}`}
      subtitle={ctx.org?.name}
      cta={mut.createService.isPending ? 'Creando…' : isPrivate ? 'Crear privada' : `Crear ${n} ${n === 1 ? 'sesión' : 'sesiones'}`}
      onSubmit={submit}
    >
      <TimeZoneBanner tz={ctx.tz} />
      <FormGroup label="TIPO">
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(kindLabel) as Kind[]).map((k) => (
            <Chip key={k} label={kindLabel[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
      </FormGroup>

      <Field
        label="Nombre"
        value={name}
        onChangeText={setName}
        placeholder={`Ej. ${disciplines[0]?.name ?? 'Nombre'} principiantes`}
        maxLength={80}
      />

      {disciplines.length ? (
        <FormGroup label="DISCIPLINA">
          <View className="flex-row flex-wrap gap-2">
            {disciplines.map((d) => (
              <Chip
                key={d.id}
                label={d.name}
                selected={disciplineId === d.id}
                onPress={() => setDisciplineId(disciplineId === d.id ? undefined : d.id)}
              />
            ))}
          </View>
        </FormGroup>
      ) : null}

      <FormGroup label="NIVEL">
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(levelLabel) as Level[]).map((l) => (
            <Chip key={l} label={levelLabel[l]} selected={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>
      </FormGroup>

      <View className="flex-row gap-2.5">
        <Field
          label={`Precio (${ctx.currency})`}
          value={price}
          onChangeText={(v) => setPrice(v.replace(/[^\d.,]/g, ''))}
          placeholder="180"
          keyboardType="decimal-pad"
          containerClassName="flex-1"
          maxLength={9}
        />
        <Field
          label="Duración (min)"
          value={duration}
          onChangeText={(v) => setDuration(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          containerClassName="flex-1"
          maxLength={3}
        />
      </View>

      {isPrivate ? (
        <>
          <FormGroup label="LA IMPARTE">
            <View className="flex-row flex-wrap gap-2">
              {ctx.instructors.map((m) => (
                <Chip
                  key={m.userId}
                  label={m.name}
                  selected={(teacher ?? session?.user.id) === m.userId}
                  onPress={() => setTeacher(m.userId)}
                />
              ))}
            </View>
          </FormGroup>
          <Field
            label="Descanso entre sesiones (min)"
            value={buffer}
            onChangeText={(v) => setBuffer(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />
          <InfoBanner icon={Repeat} tone="orange" text="Los horarios disponibles salen de la disponibilidad semanal de quien la imparte." />
        </>
      ) : ctx.rooms.length === 0 ? (
        <InfoBanner icon={Repeat} tone="amber" text={`Primero agrega un ${ctx.terms.room.toLowerCase()} en tu ubicación.`} />
      ) : (
        <ScheduleFields
          value={schedule}
          onChange={setSchedule}
          rooms={ctx.rooms}
          instructors={ctx.instructors}
          tz={ctx.tz}
          roomTerm={ctx.terms.room}
          instructorTerm={ctx.terms.instructor}
        />
      )}

      {isPrivate ? null : (
        <InfoBanner
          icon={Repeat}
          tone="orange"
          text={`${schedule.time} · ${schedule.repeatWeeks ? `${schedule.repeatWeeks} semanas` : 'una sola vez'} · ${n} ${n === 1 ? 'sesión' : 'sesiones'}`}
        />
      )}
      <ConflictList error={mut.createService.error ?? undefined} roomTerm={ctx.terms.room} instructorTerm={ctx.terms.instructor} />
      <Text variant="muted" className="text-xs">
        Cobra {ctx.org?.name} · responsable financiero del servicio.
      </Text>
    </FormScreen>
  );
}
