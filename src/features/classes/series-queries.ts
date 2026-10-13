import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, servicesKey, sessionsKey } from '@/features/organizations/queries';
import { api } from '@/lib/api';
import { asDateString } from '@/lib/dates';

export type SeriesBody = { weekdays: number[]; startDate: string; endDate: string; startTime: string };

export type EditSummary = {
  add: number;
  remove: number;
  withBookings: { sessionId: string; startsAt: number | string | Date; bookings: number }[];
  bookingsAffected: number;
};

/** Error de la edición: puede traer el resumen de reservas afectadas (`HAS_BOOKINGS`) o choques de horario. */
export class SeriesError extends ApiError {
  code?: string;
  summary?: EditSummary;
}

const seriesKey = (orgId: string, serviceId: string) => ['orgs', orgId, 'series', serviceId] as const;

/** Horarios recurrentes de un servicio (con sesiones próximas y reservas). */
export function useSeries(orgId: string | null | undefined, serviceId: string | undefined) {
  return useQuery({
    queryKey: seriesKey(orgId ?? '', serviceId ?? ''),
    enabled: !!orgId && !!serviceId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).services({ serviceId: serviceId! }).series.get();
      if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar los horarios');
      // El cliente convierte los textos con forma de fecha en `Date`; se vuelven a «YYYY-MM-DD».
      return data.map((s) => ({ ...s, startDate: asDateString(s.startDate), endDate: asDateString(s.endDate) }));
    },
  });
}

export type SeriesItem = NonNullable<ReturnType<typeof useSeries>['data']>[number];

async function call(orgId: string, seriesId: string, body: SeriesBody & { dryRun?: boolean; force?: boolean }) {
  const { data, error } = await api.orgs({ id: orgId }).series({ seriesId }).patch(body);
  if (error) {
    const v = error.value as { message?: string; code?: string; summary?: EditSummary; conflicts?: SeriesError['conflicts'] } | undefined;
    const e = new SeriesError(v?.message ?? 'No se pudo guardar el horario');
    e.code = v?.code;
    e.summary = v?.summary;
    e.conflicts = v?.conflicts;
    throw e;
  }
  return data;
}

/** Vista previa (sin guardar): cuántas sesiones se crearían y cuántas se quitarían, y si hay reservas. */
export function useSeriesPreview(orgId: string | null | undefined, seriesId: string | undefined, body: SeriesBody | null) {
  return useQuery({
    queryKey: ['orgs', orgId ?? '', 'series-preview', seriesId ?? '', body],
    enabled: !!orgId && !!seriesId && !!body,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await call(orgId!, seriesId!, { ...body!, dryRun: true });
      return (r as { summary: EditSummary }).summary;
    },
  });
}

export function useEditSeries(orgId: string, serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { seriesId: string; body: SeriesBody; force?: boolean }) => {
      const r = await call(orgId, v.seriesId, { ...v.body, force: v.force });
      return r as { added: number; removed: number; bookingsCanceled: number };
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: seriesKey(orgId, serviceId) }),
        qc.invalidateQueries({ queryKey: servicesKey(orgId) }),
        qc.invalidateQueries({ queryKey: sessionsKey(orgId) }),
        qc.invalidateQueries({ queryKey: ['discover'] }),
      ]),
  });
}
