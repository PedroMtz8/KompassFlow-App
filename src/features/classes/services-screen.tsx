import { router } from 'expo-router';
import Clock from 'lucide-react-native/icons/clock';
import Plus from 'lucide-react-native/icons/plus';
import Users from 'lucide-react-native/icons/users';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { can } from '@/features/organizations/permissions';
import { useServices } from '@/features/organizations/queries';
import { toneFor } from '@/features/session/switch-space-screen';
import { formatMoney } from '@/lib/dates';
import { useIsDesktop } from '@/lib/use-layout';

import { kindLabel, levelLabel } from './class-labels';
import { useClassContext } from './use-class-context';

/** Catálogo de lo que vende la organización (clases, privadas, talleres…). */
export function ServicesScreen() {
  const t = useTheme();
  const ctx = useClassContext();
  const services = useServices(ctx.activeId);
  const desktop = useIsDesktop();
  const canCreate = can(ctx.org, 'service', 'create');
  const term = ctx.terms?.session ?? 'Clase';

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-10">
        <View className="gap-[3px] pb-1 pt-1">
          <Text variant="h2">{term}s y servicios</Text>
          <Text variant="muted">{ctx.org?.name}</Text>
        </View>
        {canCreate ? (
          <Button size="lg" onPress={() => router.push('/new-class')} className={desktop ? 'self-start px-6' : 'self-stretch'}>
            <Icon as={Plus} size={18} color="#fff" />
            <Text className="text-[15px]">Nueva {term.toLowerCase()}</Text>
          </Button>
        ) : null}
        <QueryStatus q={services} />
        {services.data?.length === 0 ? (
          <View className="items-center gap-2 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
            <Text className="text-base font-extrabold">Todavía no hay {term.toLowerCase()}s</Text>
            <Text variant="muted" className="text-center">
              Crea la primera y programa sus horarios: aparecerá en la agenda y en Descubrir.
            </Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-3">
          {services.data?.map((s) => {
            const tone = toneFor(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: '/edit-service', params: { serviceId: s.id } })}
                className="w-full gap-2.5 rounded-[22px] bg-card p-4 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)] active:opacity-90"
                style={{ width: desktop ? '49%' : '100%', opacity: s.isActive ? 1 : 0.6 }}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-base font-extrabold" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Badge tone={tone}>{kindLabel[s.kind]}</Badge>
                      {s.disciplineName ? <Badge tone="ink">{s.disciplineName}</Badge> : null}
                      {!s.isActive ? <Badge tone="ink">INACTIVO</Badge> : null}
                    </View>
                  </View>
                  <Text variant="mono" className="text-base">
                    {formatMoney(s.priceCents, ctx.currency)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-4">
                  <View className="flex-row items-center gap-1.5">
                    <Icon as={Clock} size={14} color="#6B6270" />
                    <Text className="text-xs text-muted-foreground">{s.durationMin} min</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Icon as={Users} size={14} color="#6B6270" />
                    <Text className="text-xs text-muted-foreground">{levelLabel[s.level]}</Text>
                  </View>
                </View>
                <Text className="text-xs font-bold" style={{ color: s.upcomingSessions ? t.tealDark : t.subtle }}>
                  {s.upcomingSessions
                    ? `${s.upcomingSessions} ${s.upcomingSessions === 1 ? 'sesión próxima' : 'sesiones próximas'}`
                    : 'Sin sesiones programadas'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
