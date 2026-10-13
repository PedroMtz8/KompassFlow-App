import { router } from 'expo-router';
import { CalendarDays, ChevronUp, EyeOff, UserPlus, Banknote, CalendarPlus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { TimeZoneBanner } from '@/components/timezone';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { QuickAction } from '@/components/ui/quick-action';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Text } from '@/components/ui/text';
import { SessionRow } from '@/features/classes/session-row';
import { useClassContext } from '@/features/classes/use-class-context';
import { can } from '@/features/organizations/permissions';
import { useOrganization, useSessions } from '@/features/organizations/queries';
import { roleLabel } from '@/features/organizations/space';
import { localDateOf } from '@/lib/dates';
import { useRefresh } from '@/lib/use-refresh';
import { useIsDesktop } from '@/lib/use-layout';
import { RefreshButton } from '@/components/ui/refresh-button';
import { NotificationBell } from '@/features/notifications/bell';
import { useState } from 'react';

/** Hoy en la organización: cifras del día, accesos rápidos y las sesiones de hoy. */
export function TodayScreen() {
  const ctx = useClassContext();
  const { org } = ctx;
  const desktop = useIsDesktop();
  const [today] = useState(() => localDateOf(Date.now(), ctx.tz));
  const detail = useOrganization(ctx.activeId);
  const { refresh, busy } = useRefresh(['orgs', ctx.activeId ?? '']);
  const sessions = useSessions(ctx.activeId, today, today);
  const tz = sessions.data?.timezone ?? ctx.tz;
  const list = (sessions.data?.sessions ?? []).filter((s) => s.status === 'SCHEDULED');
  const weekday = new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric' }).toUpperCase();
  const seats = list.reduce((sum, s) => sum + s.capacity, 0);
  const teachers = new Set(list.map((s) => s.instructorId).filter(Boolean)).size;
  const term = ctx.terms?.session ?? 'Clase';

  const aside = (
    <View className="gap-3" style={desktop ? { width: 340 } : undefined}>
      <StatCard
        title="Hoy en tu espacio"
        icon={CalendarDays}
        stats={[
          { value: String(list.length), label: list.length === 1 ? 'sesión' : 'sesiones' },
          { value: String(seats), label: 'lugares' },
          { value: String(teachers), label: ctx.terms?.instructors.toLowerCase() ?? 'instructores' },
        ]}
      />
      <View className="flex-row gap-2">
        {can(org, 'session', 'create') ? (
          <QuickAction label={`Nueva ${term.toLowerCase()}`} icon={CalendarPlus} tone="orange" onPress={() => router.push('/new-class')} />
        ) : null}
        {can(org, 'student', 'create') ? (
          <QuickAction label="Nuevo alumno" icon={UserPlus} tone="violet" onPress={() => router.push('/new-student')} />
        ) : null}
        {can(org, 'payment', 'create') ? (
          <QuickAction label="Registrar pago" icon={Banknote} tone="teal" onPress={() => router.push('/register-payment')} />
        ) : null}
      </View>
    </View>
  );

  const agenda = (
    <View className="min-w-0 flex-1 gap-2">
      <SectionHeader title="Sesiones de hoy" action="Agenda" onAction={() => router.push('/schedule')} />
      <QueryStatus q={sessions} />
      {!sessions.isPending && !sessions.isError && list.length === 0 ? (
        <View className="items-center gap-1 rounded-[20px] bg-card p-5">
          <Text className="text-sm font-bold">No hay sesiones hoy</Text>
          <Text variant="muted" className="text-center">
            Programa una {term.toLowerCase()} y aparecerá aquí.
          </Text>
        </View>
      ) : null}
      <View>
        {list.map((s, i) => (
          <View key={s.id}>
            <SessionRow s={s} tz={tz} />
            {i < list.length - 1 ? <ListDivider /> : null}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-10" onRefresh={refresh}>
        <View className="flex-row items-center gap-[11px] pb-0.5 pt-1">
          <Avatar name={org?.name} uri={org?.logo ?? org?.coverImage} size={40} radius={14} />
          <View className="flex-1 gap-px">
            <Text className="text-base font-extrabold tracking-[-0.02em]">{org?.name ?? 'Mi espacio'}</Text>
            <Text className="text-[11px] font-extrabold tracking-[0.06em] text-primary-dark">
              {weekday}
              {org ? ` · ${roleLabel(org.role, ctx.terms?.instructor)}` : ''}
            </Text>
          </View>
          {desktop ? <RefreshButton onPress={refresh} busy={busy} /> : null}
          {!desktop ? <NotificationBell /> : null}
          {!desktop ? (
            <Pressable
              onPress={() => router.push('/switch-space')}
              className="h-9 w-9 items-center justify-center rounded-xl bg-card active:opacity-80"
            >
              <Icon as={ChevronUp} size={18} />
            </Pressable>
          ) : null}
        </View>

        <TimeZoneBanner tz={tz} />
        {detail.data && !detail.data.isPublished ? (
          <Pressable onPress={() => router.push(detail.data.verificationStatus === 'APPROVED' ? '/edit-academy' : '/verification')} className="active:opacity-80">
            <InfoBanner
              icon={EyeOff}
              tone="amber"
              text={
                detail.data.verificationStatus === 'PENDING'
                  ? 'Tu solicitud de publicación está en revisión. Cuando la verifiquemos, tus clases saldrán en Descubrir.'
                  : detail.data.verificationStatus === 'REJECTED'
                    ? 'No pudimos verificar tu negocio. Toca para ver el motivo y volver a solicitarlo.'
                    : detail.data.verificationStatus === 'APPROVED'
                      ? 'Tu negocio está verificado pero oculto: los alumnos no ven tus clases. Toca para mostrarlo.'
                      : 'Tu negocio aún no está publicado: los alumnos no verán tus clases en Descubrir. Toca para completar tu perfil y solicitar la publicación.'
              }
            />
          </Pressable>
        ) : null}

        {desktop ? (
          <View className="flex-row items-start gap-6">
            {agenda}
            {aside}
          </View>
        ) : (
          <>
            {aside}
            {agenda}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
