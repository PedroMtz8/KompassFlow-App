import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDiscoverFilters } from '@/features/discover/filters';
import { api } from '@/lib/api';

const fail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

/* ── Lado alumno ─────────────────────────────────────────────────────────── */

export const discoverKey = ['discover'] as const;
export const myBookingsKey = ['me', 'bookings'] as const;

/**
 * Sesiones próximas de organizaciones publicadas. Los filtros de Descubrir (cuándo, disciplina, nivel, con lugares)
 * y la búsqueda se aplican en el SERVIDOR: cada cambio vuelve a consultar, así lo recién publicado aparece al filtrar.
 */
export function useDiscoverSessions(q?: string) {
  const { when, disciplineIds, levels, onlyAvailable } = useDiscoverFilters();
  const csv = (list: string[]) => (list.length ? [...list].sort().join(',') : undefined);
  const query = {
    when: csv(when),
    disciplineIds: csv(disciplineIds),
    levels: csv(levels),
    onlyAvailable: onlyAvailable ? ('true' as const) : undefined,
    q: q?.trim() || undefined,
  };
  return useQuery({
    queryKey: [...discoverKey, 'list', query],
    // Mientras llega la consulta nueva se sigue mostrando la anterior (sin parpadeo de «cargando»).
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.discover.sessions.get({ query });
      if (error) throw new Error('No se pudieron cargar las clases');
      return data;
    },
  });
}

export type DiscoverSession = NonNullable<ReturnType<typeof useDiscoverSessions>['data']>[number];

export function useDiscoverSession(id: string | undefined) {
  return useQuery({
    queryKey: [...discoverKey, 'one', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.discover.sessions({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar la clase');
      return data;
    },
  });
}

export function useBookSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await api.discover.sessions({ id: sessionId }).book.post();
      if (error) return fail(error, 'No se pudo reservar');
      return data;
    },
    // Cupo y "ya reservé" cambian en Descubrir, en el detalle y en Mis clases.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: discoverKey }), qc.invalidateQueries({ queryKey: myBookingsKey })]),
  });
}

/** Tamaño de página de las listas largas (alumnos, reservas): se cargan más al pedirlo. */
export const PAGE_SIZE = 30;

/** Mis reservas, de la página más reciente hacia adelante: `data` es la lista ya cargada; `fetchNextPage` trae más. */
export function useMyBookings(scope: 'upcoming' | 'past') {
  return useInfiniteQuery({
    queryKey: [...myBookingsKey, 'list', scope],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.me.bookings.get({ query: { scope, limit: PAGE_SIZE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar tus reservas');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length * PAGE_SIZE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export type MyBooking = NonNullable<ReturnType<typeof useMyBookings>['data']>[number];

/** Clases tomadas y academias (totales reales, no los de las páginas cargadas). */
export function useMyBookingSummary() {
  return useQuery({
    queryKey: [...myBookingsKey, 'summary'],
    queryFn: async () => {
      const { data, error } = await api.me.bookings.summary.get();
      if (error) throw new Error('No se pudo cargar el resumen');
      return data;
    },
  });
}

/** Una reserva por id (detalle): no depende de la página de la lista en que caiga. */
export function useMyBooking(id: string | undefined) {
  return useQuery({
    queryKey: [...myBookingsKey, 'one', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.me.bookings({ id: id! }).get();
      if (error) {
        if ((error.status as number) === 404) return null;
        throw new Error('No se pudo cargar la reserva');
      }
      return data;
    },
  });
}

/** El alumno avisa que llegó a su clase (la academia lo confirma en su lista). */
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await api.me.bookings({ id: bookingId })['check-in'].post();
      if (error) fail(error, 'No se pudo avisar tu llegada');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: myBookingsKey }),
  });
}

export function useCancelMyBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await api.me.bookings({ id: bookingId }).cancel.post();
      if (error) fail(error, 'No se pudo cancelar');
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: discoverKey }), qc.invalidateQueries({ queryKey: myBookingsKey })]),
  });
}

/* ── Lado organización ───────────────────────────────────────────────────── */

export const studentsKey = (orgId: string) => ['orgs', orgId, 'students'] as const;
export const rosterKey = (orgId: string, sessionId: string) => ['orgs', orgId, 'roster', sessionId] as const;

/** Alumnos de la academia (con búsqueda), por páginas: `data` es la lista ya cargada; `fetchNextPage` trae más. */
export function useStudents(orgId: string | null | undefined, q?: string) {
  return useInfiniteQuery({
    queryKey: [...studentsKey(orgId ?? ''), 'list', q ?? ''],
    enabled: !!orgId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.orgs({ id: orgId! }).students.get({ query: { q: q || undefined, limit: PAGE_SIZE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar los alumnos');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length * PAGE_SIZE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export type StudentItem = NonNullable<ReturnType<typeof useStudents>['data']>[number];

export function useStudent(orgId: string | null | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: [...studentsKey(orgId ?? ''), 'one', studentId ?? ''],
    enabled: !!orgId && !!studentId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).students({ studentId: studentId! }).get();
      if (error) throw new Error('No se pudo cargar el alumno');
      return data;
    },
  });
}

export type StudentBody = {
  name: string;
  phone?: string;
  email?: string;
  level?: 'NEW' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  notes?: string;
};

export function useStudentMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: studentsKey(orgId) });
  return {
    create: useMutation({
      mutationFn: async (v: StudentBody) => {
        const { data, error } = await api.orgs({ id: orgId }).students.post(v);
        if (error) return fail(error, 'No se pudo guardar');
        return data;
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: Partial<StudentBody> & { studentId: string }) => {
        const { studentId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).students({ studentId }).patch(body);
        if (error) fail(error, 'No se pudo guardar');
      },
      onSuccess: refresh,
    }),
  };
}

export function useRoster(orgId: string | null | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: rosterKey(orgId ?? '', sessionId ?? ''),
    enabled: !!orgId && !!sessionId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).sessions({ sessionId: sessionId! }).roster.get();
      if (error) throw new Error('No se pudo cargar la lista');
      return data;
    },
  });
}

export function useStaffBookingMutations(orgId: string, sessionId: string) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: rosterKey(orgId, sessionId) }),
      qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sessions'] }),
      qc.invalidateQueries({ queryKey: studentsKey(orgId) }),
    ]);
  return {
    book: useMutation({
      mutationFn: async (studentId: string) => {
        const { error } = await api.orgs({ id: orgId }).sessions({ sessionId }).bookings.post({ studentId });
        if (error) fail(error, 'No se pudo reservar');
      },
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: async (bookingId: string) => {
        const { error } = await api.orgs({ id: orgId }).bookings({ bookingId }).cancel.post();
        if (error) fail(error, 'No se pudo cancelar');
      },
      onSettled: refresh,
    }),
  };
}

/* ── Academias (perfil público) ──────────────────────────────────────────── */

export function useDiscoverOrgs() {
  return useQuery({
    queryKey: [...discoverKey, 'orgs'],
    queryFn: async () => {
      const { data, error } = await api.discover.orgs.get();
      if (error) throw new Error('No se pudieron cargar las academias');
      return data;
    },
  });
}

export type DiscoverOrgItem = NonNullable<ReturnType<typeof useDiscoverOrgs>['data']>[number];

export function useDiscoverOrg(id: string | undefined) {
  return useQuery({
    queryKey: [...discoverKey, 'org', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.discover.orgs({ id: id! }).get();
      if (error) throw new Error('No se pudo cargar la academia');
      return data;
    },
  });
}

/* ── Asistencia y reportes ───────────────────────────────────────────────── */

export const attendanceKey = (orgId: string, sessionId: string) => ['orgs', orgId, 'attendance', sessionId] as const;

export function useAttendance(orgId: string | null | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: attendanceKey(orgId ?? '', sessionId ?? ''),
    enabled: !!orgId && !!sessionId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).sessions({ sessionId: sessionId! }).attendance.get();
      if (error) throw new Error('No se pudo cargar la lista');
      return data;
    },
  });
}

export type AttendanceData = NonNullable<ReturnType<typeof useAttendance>['data']>;

export function useAttendanceMutations(orgId: string, sessionId: string) {
  const qc = useQueryClient();
  const key = attendanceKey(orgId, sessionId);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ['orgs', orgId, 'reports'] }),
      qc.invalidateQueries({ queryKey: studentsKey(orgId) }),
    ]);
  return {
    mark: useMutation({
      mutationFn: async (v: { bookingId: string; status: 'PRESENT' | 'ABSENT' | null }) => {
        const { error } = await api
          .orgs({ id: orgId })
          .sessions({ sessionId })
          .attendance({ bookingId: v.bookingId })
          .put({ status: v.status });
        if (error) fail(error, 'No se pudo guardar');
      },
      // Actualización optimista: la marca se ve al instante y se corrige si el servidor la rechaza.
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<AttendanceData>(key);
        qc.setQueryData<AttendanceData>(key, (old) => {
          if (!old) return old;
          const students = old.students.map((s) => (s.bookingId === v.bookingId ? { ...s, status: v.status } : s));
          const present = students.filter((s) => s.status === 'PRESENT').length;
          const absent = students.filter((s) => s.status === 'ABSENT').length;
          return { ...old, students, summary: { total: students.length, present, absent, unmarked: students.length - present - absent } };
        });
        return { prev };
      },
      onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.prev),
      onSettled: refresh,
    }),
    close: useMutation({
      mutationFn: async () => {
        const { data, error } = await api.orgs({ id: orgId }).sessions({ sessionId }).attendance.close.post();
        if (error) fail(error, 'No se pudo cerrar la lista');
        return data;
      },
      onSuccess: refresh,
    }),
    reopen: useMutation({
      mutationFn: async () => {
        const { error } = await api.orgs({ id: orgId }).sessions({ sessionId }).attendance.reopen.post();
        if (error) fail(error, 'No se pudo reabrir la lista');
      },
      onSuccess: refresh,
    }),
  };
}

export function useReportSummary(orgId: string | null | undefined, days: number) {
  return useQuery({
    queryKey: ['orgs', orgId ?? '', 'reports', days],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).reports.summary.get({ query: { days } });
      if (error) throw new Error('No se pudo cargar el reporte');
      return data;
    },
  });
}

/* ── Vincular alumno con cuenta ──────────────────────────────────────────── */

/** Recepción genera un código de un solo uso para un alumno sin cuenta. */
export function useCreateLinkCode(orgId: string) {
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { data, error } = await api.orgs({ id: orgId }).students({ studentId })['link-code'].post();
      if (error || !data) fail(error, 'No se pudo generar el código');
      return data as { code: string; expiresAt: Date };
    },
  });
}

/** La persona canjea el código con su cuenta; se une el historial del alumno a su cuenta. */
export function useRedeemLinkCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await api.me['link-code'].post({ code });
      if (error || !data) fail(error, 'No se pudo vincular');
      return data as { studentName: string; organizationName: string; merged: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: myBookingsKey }),
  });
}

/* ── Clases privadas ─────────────────────────────────────────────────────── */

export const availabilityKey = (orgId: string) => ['orgs', orgId, 'availability'] as const;

/** Disponibilidad semanal propia (ventanas por día de la semana, 0 = domingo). */
export function useAvailability(orgId: string | null | undefined) {
  return useQuery({
    queryKey: availabilityKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).availability.get();
      if (error) throw new Error('No se pudo cargar la disponibilidad');
      return data.windows;
    },
  });
}

export function useSaveAvailability(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (windows: { weekday: number; startTime: string; endTime: string }[]) => {
      const { error } = await api.orgs({ id: orgId }).availability.put({ windows });
      if (error) fail(error, 'No se pudo guardar');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(orgId) }),
  });
}

/** Horarios reservables de una privada (próximos 14 días). */
export function usePrivateSlots(serviceId: string | undefined) {
  return useQuery({
    queryKey: [...discoverKey, 'slots', serviceId ?? ''],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await api.discover.services({ id: serviceId! }).slots.get();
      if (error) throw new Error('No se pudieron cargar los horarios');
      return data;
    },
  });
}

export function useBookSlot(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (startsAt: number) => {
      const { data, error } = await api.discover.services({ id: serviceId })['book-slot'].post({ startsAt });
      if (error) fail(error, 'No se pudo reservar');
      return data as { bookingId: string; sessionId: string };
    },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: discoverKey }), qc.invalidateQueries({ queryKey: myBookingsKey })]),
  });
}

/* ── Lista de espera ─────────────────────────────────────────────────────── */

export const waitlistKey = ['me', 'waitlist'] as const;

/** Mis filas de espera activas (con mi posición y si ya tengo un lugar apartado). */
export function useMyWaitlist() {
  return useQuery({
    queryKey: waitlistKey,
    queryFn: async () => {
      const { data, error } = await api.me.waitlist.get();
      if (error) throw new Error('No se pudo cargar tu lista de espera');
      return data;
    },
  });
}

export type MyWaitlistItem = NonNullable<ReturnType<typeof useMyWaitlist>['data']>[number];

export function useWaitlistActions() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: discoverKey }), qc.invalidateQueries({ queryKey: waitlistKey }), qc.invalidateQueries({ queryKey: myBookingsKey })]);
  return {
    join: useMutation({
      mutationFn: async (sessionId: string) => {
        const { error } = await api.discover.sessions({ id: sessionId }).waitlist.post();
        if (error) fail(error, 'No se pudo entrar a la lista de espera');
      },
      onSettled: refresh,
    }),
    leave: useMutation({
      mutationFn: async (sessionId: string) => {
        const { error } = await api.discover.sessions({ id: sessionId }).waitlist.delete();
        if (error) fail(error, 'No se pudo salir de la lista');
      },
      onSettled: refresh,
    }),
  };
}

/** Fila de espera de una sesión (equipo): quién espera y a quién se le apartó el lugar. */
export function useSessionWaitlist(orgId: string | null | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: ['orgs', orgId ?? '', 'waitlist', sessionId ?? ''],
    enabled: !!orgId && !!sessionId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).sessions({ sessionId: sessionId! }).waitlist.get();
      if (error) throw new Error('No se pudo cargar la lista de espera');
      return data;
    },
  });
}

export function useRemoveFromWaitlist(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await api.orgs({ id: orgId }).waitlist({ entryId }).delete();
      if (error) fail(error, 'No se pudo quitar de la lista');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', orgId, 'waitlist'] }),
  });
}

/* ── Perfil (resumen como alumna) ────────────────────────────────────────── */

export const profileSummaryKey = ['me', 'profile-summary'] as const;

/** Desde cuándo baila, academias, clases y horas, disciplinas y últimas clases. */
export function useProfileSummary() {
  return useQuery({
    queryKey: profileSummaryKey,
    queryFn: async () => {
      const { data, error } = await api.me['profile-summary'].get();
      if (error || !data) throw new Error('No se pudo cargar tu resumen');
      return data;
    },
  });
}
