import { router } from 'expo-router';
import { Building2, Landmark, Repeat, ShieldCheck, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { InfoBanner } from '@/components/ui/info-banner';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { TintedStat } from '@/components/ui/tinted-stat';
import { useAdminOverview } from '@/features/admin/queries';
import { formatMoney } from '@/lib/dates';
import { useIsDesktop } from '@/lib/use-layout';
import { useTheme } from '@/lib/theme';

const PLAN_NAME: Record<string, string> = { free: 'Gratis', starter: 'Starter', pro: 'Pro', business: 'Business' };
const FUNDING: Record<string, string> = { credit: 'Crédito', debit: 'Débito', prepaid: 'Prepago', unknown: 'Sin identificar' };
const monthName = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))).replace('.', '');
};

/** Resumen de la plataforma: academias, ingreso por suscripciones, cobros con tarjeta y comisión ganada. */
export function AdminOverviewScreen() {
  const q = useAdminOverview();
  const desktop = useIsDesktop();
  const t = useTheme();
  const o = q.data;
  const money = (cents: number) => formatMoney(cents, 'MXN');
  const maxFee = Math.max(1, ...(o?.card.feeByMonth.map((m) => m.feeCents) ?? [1]));
  const fundingTotal = o ? Object.values(o.card.funding).reduce((a, f) => a + f.amountCents, 0) : 0;

  return (
    <Screen>
      <ScreenScroll wide contentContainerClassName="gap-3 pb-8" onRefresh={() => q.refetch()}>
        <View className="flex-row items-center justify-between pb-1 pt-1">
          <Text variant="h2">Plataforma</Text>
          {desktop ? <RefreshButton onPress={() => q.refetch()} busy={q.isFetching} /> : null}
        </View>
        <QueryStatus q={q} />
        {o ? (
          <>
            {o.verifications.pending > 0 ? (
              <Pressable onPress={() => router.navigate('/verifications' as never)} className="active:opacity-80">
                <InfoBanner
                  icon={ShieldCheck}
                  tone="violet"
                  variant="alert"
                  text={`${o.verifications.pending} ${o.verifications.pending === 1 ? 'negocio espera' : 'negocios esperan'} verificación`}
                />
              </Pressable>
            ) : null}
            <View className="flex-row gap-2.5">
              <TintedStat
                icon={Building2}
                tone="green"
                value={String(o.orgs.total)}
                label={`academias · ${o.orgs.last30} nuevas en 30 días`}
              />
              <TintedStat icon={Users} tone="violet" value={String(o.students)} label={`alumnos · ${o.users} cuentas`} />
            </View>
            <View className="flex-row gap-2.5">
              <TintedStat
                icon={Repeat}
                tone="orange"
                value={money(o.subscriptions.mrrMxn * 100)}
                label={`ingreso mensual · +${money(o.subscriptions.trialMrrMxn * 100)} en prueba`}
              />
              <TintedStat icon={Landmark} tone="amber" value={money(o.card.month.feeCents)} label="comisión de este mes" />
            </View>

            <SectionHeader title="Suscripciones por plan" className="pt-1" />
            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              {Object.entries(o.subscriptions.plans).map(([k, v]) => (
                <View key={k} className="flex-row items-center justify-between">
                  <Text className="text-[13.5px] font-bold">{PLAN_NAME[k] ?? k}</Text>
                  <Text className="font-mono-bold text-[13px]">
                    {v.active} {v.active === 1 ? 'academia' : 'academias'}
                    {v.trialing ? ` · ${v.trialing} en prueba` : ''}
                  </Text>
                </View>
              ))}
            </View>

            <SectionHeader title="Cobros con tarjeta de alumnos" className="pt-1" />
            <View className="gap-2 rounded-[22px] bg-card p-4">
              <Row label="Este mes" a={`${o.card.month.count} pagos`} b={money(o.card.month.volumeCents)} />
              <Row label="Total" a={`${o.card.all.count} pagos`} b={money(o.card.all.volumeCents)} />
              <Row label="Comisión ganada (total)" a="" b={money(o.card.all.feeCents)} bold />
              {o.card.all.refunded ? <Row label="Reembolsados" a="" b={String(o.card.all.refunded)} /> : null}
            </View>

            <SectionHeader title="Comisión por mes" className="pt-1" />
            <View className="gap-2 rounded-[22px] bg-card p-4">
              <View className="h-[88px] flex-row items-end gap-2">
                {o.card.feeByMonth.map((m) => (
                  <View key={m.month} className="flex-1 items-center gap-1" style={{ height: '100%', justifyContent: 'flex-end' }}>
                    <Text className="font-mono-bold text-[10px] text-muted-foreground">{m.feeCents ? money(m.feeCents) : ''}</Text>
                    <View
                      className="w-full rounded-t-[6px]"
                      style={{
                        height: `${Math.max((m.feeCents / maxFee) * 70, m.feeCents ? 6 : 3)}%`,
                        backgroundColor: m.feeCents ? t.primary : t.muted,
                      }}
                    />
                  </View>
                ))}
              </View>
              <View className="flex-row gap-2">
                {o.card.feeByMonth.map((m) => (
                  <Text key={m.month} className="flex-1 text-center text-[11px] font-bold uppercase text-muted-foreground">
                    {monthName(m.month)}
                  </Text>
                ))}
              </View>
            </View>

            <SectionHeader title="Tarjeta de crédito o débito" className="pt-1" />
            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              {fundingTotal === 0 ? <Text variant="muted">Aún no hay cobros con tarjeta.</Text> : null}
              {Object.entries(o.card.funding).map(([k, v]) => (
                <View key={k} className="gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[13.5px] font-bold">{FUNDING[k] ?? k}</Text>
                    <Text className="font-mono-bold text-[13px]">
                      {v.count} · {money(v.amountCents)}
                    </Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-muted">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${fundingTotal ? (v.amountCents / fundingTotal) * 100 : 0}%`,
                        backgroundColor: k === 'credit' ? t.primary : k === 'debit' ? t.teal : t.violet,
                      }}
                    />
                  </View>
                </View>
              ))}
              <Text variant="muted" className="text-xs">
                Las academias no ven este dato.
              </Text>
            </View>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function Row({ label, a, b, bold }: { label: string; a: string; b: string; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={bold ? 'text-[13.5px] font-extrabold' : 'text-[13.5px] font-semibold'}>{label}</Text>
      <Text className={bold ? 'font-mono-bold text-[14px]' : 'font-mono text-[13px] text-muted-foreground'}>{a ? `${a} · ${b}` : b}</Text>
    </View>
  );
}
