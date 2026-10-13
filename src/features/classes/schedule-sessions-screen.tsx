import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { FormScreen } from '@/components/form-screen';
import { Text } from '@/components/ui/text';
import { useClassMutations, useServices } from '@/features/organizations/queries';
import { authClient } from '@/lib/auth-client';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

import { ConflictList } from './conflict-list';
import { initialSchedule, ScheduleFields, scheduleIsValid, sessionCount, toScheduleBody, type ScheduleState } from './schedule-form';
import { useClassContext } from './use-class-context';

/** Agrega sesiones a un servicio que ya existe. */
export function ScheduleSessionsScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const ctx = useClassContext();
  const services = useServices(ctx.activeId);
  const { data: session } = authClient.useSession();
  const mut = useClassMutations(ctx.activeId ?? '');
  const [sched, setSched] = useState<ScheduleState | null>(null);

  const svc = services.data?.find((s) => s.id === serviceId);
  if (services.isPending || ctx.isLoading || !ctx.terms) {
    return (
      <FormScreen title="Programar" cta="Programar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (services.isError) return <ErrorNotice fill what="la clase" busy={services.isFetching} onRetry={services.refetch} />;
  if (!svc) {
    return (
      <FormScreen title="Programar" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No encontramos este servicio.</Text>
      </FormScreen>
    );
  }

  const value = sched ?? initialSchedule(ctx.rooms, ctx.instructors, session?.user.id, ctx.tz);
  const n = sessionCount(value);

  return (
    <FormScreen
      title="Agregar otro horario"
      subtitle={svc.name}
      cta={mut.schedule.isPending ? 'Programando…' : `Crear ${n} ${n === 1 ? 'sesión' : 'sesiones'}`}
      onSubmit={() => {
        if (!scheduleIsValid(value)) return done('Revisa el horario.');
        mut.schedule.mutate(
          { serviceId: svc.id, schedule: toScheduleBody(value) },
          { onSuccess: (r) => done(`${r.sessions} ${r.sessions === 1 ? 'sesión creada' : 'sesiones creadas'}`, goBack) }
        );
      }}
    >
      <ScheduleFields
        value={value}
        onChange={setSched}
        rooms={ctx.rooms}
        instructors={ctx.instructors}
        tz={ctx.tz}
        roomTerm={ctx.terms.room}
        instructorTerm={ctx.terms.instructor}
      />
      <ConflictList error={mut.schedule.error ?? undefined} roomTerm={ctx.terms.room} instructorTerm={ctx.terms.instructor} />
    </FormScreen>
  );
}
