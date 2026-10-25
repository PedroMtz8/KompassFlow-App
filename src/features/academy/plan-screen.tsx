import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import Check from 'lucide-react-native/icons/check';
import Gift from 'lucide-react-native/icons/gift';
import { ActivityIndicator, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useBilling, useBillingActions, type Billing } from '@/features/billing/queries';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization } from '@/features/organizations/queries';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';

const fmtDate = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(d)) : '';

const STATUS: Record<string, string> = { trialing: 'En prueba', active: 'Activo', past_due: 'Pago pendiente' };

const featureList = (p: Billing['plans'][number]) => [
  p.limits.students == null ? 'Alumnos ilimitados' : `Hasta ${p.limits.students} alumnos`,
  p.limits.members == null ? 'Equipo ilimitado' : `Hasta ${p.limits.members} miembros`,
  p.limits.locations == null
    ? 'Ubicaciones ilimitadas'
    : p.limits.locations === 1
      ? '1 ubicación'
      : `Hasta ${p.limits.locations} ubicaciones`,
  ...(p.limits.reports ? ['Reportes'] : []),
  p.cardFeeBps > 0 ? `${p.cardFeeBps / 100}% de comisión por cobros con tarjeta` : 'Sin comisión por cobros con tarjeta',
];

/** Plan SaaS de la organización: plan vigente, uso frente a los límites y opciones para contratar o cambiar. */
export function PlanScreen() {
  const { activeId, org } = useActiveOrganization();
  const q = useBilling(activeId);
  const act = useBillingActions(activeId ?? '');
  const canManage = can(org, 'plan', 'manage');

  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Tu plan" subtitle={org?.name} />
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }
  const b = q.data;
  if (q.isError) return <ErrorNotice fill what="tu plan" busy={q.isFetching} onRetry={q.refetch} />;
  if (!b) {
    return (
      <Screen>
        <ScreenHeader title="Tu plan" subtitle={org?.name} />
        <ScreenScroll>
          <Text variant="muted">No pudimos cargar tu plan.</Text>
        </ScreenScroll>
      </Screen>
    );
  }

  const current = b.plans.find((p) => p.key === b.plan)!;
  const usage = [
    { label: 'Alumnos', used: b.usage.students, limit: b.limits.students },
    { label: 'Equipo', used: b.usage.members, limit: b.limits.members },
    { label: 'Ubicaciones', used: b.usage.locations, limit: b.limits.locations },
  ];
  const onError = (e: Error) => done(e.message);

  return (
    <Screen>
      <ScreenHeader title="Tu plan" subtitle={org?.name} />
      <ScreenScroll contentContainerClassName="gap-3">
        {!b.enabled ? (
          <InfoBanner
            icon={AlertTriangle}
            tone="amber"
            text="La facturación aún no está activa en este entorno: no se aplican límites de plan."
          />
        ) : null}
        {b.granted ? (
          <InfoBanner
            icon={Gift}
            tone="teal"
            text={`Kompass te regaló el plan ${current.name}${b.granted.until ? ` hasta el ${fmtDate(b.granted.until)}` : ''}. ${b.granted.until ? 'Después volverás a tu plan anterior; para conservar este tendrás que contratarlo.' : ''}`.trim()}
          />
        ) : null}
        {b.status === 'past_due' ? (
          <InfoBanner
            icon={AlertTriangle}
            tone="amber"
            text="Hay un pago pendiente. Actualiza tu método de pago para no perder el acceso."
          />
        ) : null}

        <Gradient tone="orange" style={{ borderRadius: 26, padding: 16, gap: 10 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-white">{b.enabled ? current.name : 'Sin límites'}</Text>
            <Badge appearance="white" tone="orange">
              {!b.enabled ? 'Desarrollo' : b.granted ? 'Cortesía' : b.status ? (STATUS[b.status] ?? b.status) : 'Tu plan'}
            </Badge>
          </View>
          {b.enabled ? (
            <View className="flex-row items-baseline gap-1.5">
              <Text className="font-mono-bold text-[30px] leading-[30px] tracking-[-0.04em] text-white">
                {formatMoney(current.priceMxn * 100, 'MXN')}
              </Text>
              <Text className="text-[12.5px] font-semibold text-white/90">MXN / mes</Text>
            </View>
          ) : (
            <Text className="text-xs text-white/90">
              La facturación se activa al configurar Stripe. Mientras tanto no se aplican límites.
            </Text>
          )}
          {b.status === 'trialing' && b.trialEnd ? (
            <Text className="text-xs text-white/90">Prueba gratis hasta el {fmtDate(b.trialEnd)}</Text>
          ) : null}
          {b.status && b.status !== 'trialing' && b.periodEnd ? (
            <Text className="text-xs text-white/90">
              {b.cancelAtPeriodEnd ? 'Termina' : 'Renueva'} el {fmtDate(b.periodEnd)}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-x-2.5 gap-y-[7px]">
            {featureList(current).map((f) => (
              <View key={f} className="w-[48%] flex-row items-center gap-1.5">
                <Icon as={Check} size={15} color="#fff" strokeWidth={3} />
                <Text className="text-[12.5px] font-semibold text-white">{f}</Text>
              </View>
            ))}
          </View>
        </Gradient>

        <View className="gap-3 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
          <Text variant="overline">Uso</Text>
          {usage.map((u) => (
            <View key={u.label} className="gap-1.5">
              <View className="flex-row justify-between">
                <Text className="text-[12.5px] font-bold">{u.label}</Text>
                <Text className="font-mono-bold text-xs text-muted-foreground">
                  {u.used} / {u.limit ?? '∞'}
                </Text>
              </View>
              <ProgressBar
                value={u.limit ? Math.min(u.used / u.limit, 1) : 0}
                tone={u.limit && u.used / u.limit >= 0.9 ? 'pink' : 'teal'}
                height={7}
              />
            </View>
          ))}
        </View>

        {b.plans
          .filter((p) => p.key !== 'free')
          .map((p) => {
            const mine = p.key === b.plan;
            return (
              <View key={p.key} className="gap-2 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[15px] font-extrabold">{p.name}</Text>
                  <Text variant="mono" className="text-[15px]">
                    {formatMoney(p.priceMxn * 100, 'MXN')} <Text className="text-[11px] text-muted-foreground">/ mes</Text>
                  </Text>
                </View>
                <Text variant="muted" className="text-xs">
                  {featureList(p).join(' · ')}
                </Text>
                {canManage && !mine ? (
                  <Button
                    variant={p.available ? 'dark' : 'secondary'}
                    disabled={!p.available || act.subscribe.isPending}
                    onPress={() => act.subscribe.mutate(p.key, { onError })}
                  >
                    <Text>
                      {!p.available
                        ? 'No disponible aún'
                        : b.plan === 'free'
                          ? `Probar ${p.name} ${p.trialDays} días gratis`
                          : `Cambiar a ${p.name}`}
                    </Text>
                  </Button>
                ) : null}
              </View>
            );
          })}

        {canManage && b.status ? (
          <Button variant="secondary" disabled={act.portal.isPending} onPress={() => act.portal.mutate(undefined, { onError })}>
            <Text>Método de pago, facturas y cancelación</Text>
          </Button>
        ) : null}
        {!canManage ? <Text variant="muted">Solo el propietario puede cambiar el plan.</Text> : null}
      </ScreenScroll>
    </Screen>
  );
}
