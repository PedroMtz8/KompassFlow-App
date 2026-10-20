import { router } from 'expo-router';
import Banknote from 'lucide-react-native/icons/banknote';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { barShade, useTheme, type ThemeColors } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { IconTile } from '@/components/ui/icon-tile';
import { ListDivider } from '@/components/ui/list-divider';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useResolveTransfer, usePaymentsList, usePaymentsSummary } from '@/features/payments/queries';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization } from '@/features/organizations/queries';
import { formatMoney } from '@/lib/dates';
import { useDebounced } from '@/lib/use-debounced';
import { useIsDesktop } from '@/lib/use-layout';
import { done } from '@/lib/simulate';

const methodSpec = (t: ThemeColors) =>
  ({
    CASH: { label: 'Efectivo', color: t.amber },
    TRANSFER: { label: 'Transferencia', color: t.foreground },
    CARD: { label: 'Tarjeta', color: t.teal },
    OTHER: { label: 'Otro', color: t.violet },
  }) as const;

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const s = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (d: Date | string | number) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Pagos de la academia: ingresos del mes, transferencias por confirmar y corte de caja. */
export function PaymentsScreen() {
  const t = useTheme();
  const METHOD = methodSpec(t);
  const { activeId, org } = useActiveOrganization();
  const desktop = useIsDesktop();
  const [month, setMonth] = useState<string | undefined>();
  const q = usePaymentsSummary(activeId, month);
  const resolve = useResolveTransfer(activeId ?? '');
  const s = q.data;
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const list = usePaymentsList(activeId, { q: term, month: month ?? s?.month });
  const payments = list.data ?? [];
  const refresh = useCallback(() => Promise.allSettled([q.refetch(), list.refetch()]), [q, list]);

  const canRegister = can(org, 'payment', 'create');
  const canConfirm = can(org, 'payment', 'update');
  const canCash = can(org, 'cash', 'close');
  const current = month ?? s?.month;
  const money = (cents: number) => formatMoney(cents, s?.currency ?? 'MXN');
  const maxDay = Math.max(...(s?.byDay.map((d) => d.amountCents) ?? [0]), 1);

  const decide = (paymentId: string, decision: 'confirm' | 'reject') =>
    resolve.mutate(
      { paymentId, decision },
      { onSuccess: () => done(decision === 'confirm' ? 'Pago confirmado' : 'Pago rechazado'), onError: (e) => done(e.message) }
    );

  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-3 pb-6" onRefresh={refresh}>
        <View className="flex-row items-center justify-between pb-0.5 pt-1">
          <Text variant="h2">Pagos</Text>
          <View className="flex-row items-center gap-2">
            {desktop ? <RefreshButton onPress={refresh} busy={q.isFetching} /> : null}
            {canRegister ? (
              <Pressable
                onPress={() => router.push('/register-payment')}
                className="h-10 flex-row items-center gap-1.5 rounded-xl bg-primary px-3 active:opacity-80"
              >
                <Icon as={Plus} size={16} color="#fff" strokeWidth={2.5} />
                <Text className="text-[13px] font-bold text-white">Registrar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {current ? (
          <View className="flex-row items-center justify-between rounded-2xl bg-card px-2 py-1.5">
            <Pressable
              onPress={() => setMonth(shiftMonth(current, -1))}
              className="h-8 w-8 items-center justify-center rounded-lg active:bg-muted"
            >
              <Icon as={ChevronLeft} size={18} />
            </Pressable>
            <Text className="text-[13.5px] font-bold">{monthLabel(current)}</Text>
            <Pressable
              onPress={() => setMonth(shiftMonth(current, 1))}
              className="h-8 w-8 items-center justify-center rounded-lg active:bg-muted"
            >
              <Icon as={ChevronRight} size={18} />
            </Pressable>
          </View>
        ) : null}

        <QueryStatus q={q} />

        {s ? (
          <>
            <View className="gap-3 rounded-[26px] bg-card p-4 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
              <View className="flex-row items-baseline gap-2.5">
                <Text className="font-mono-bold text-[32px] leading-[32px] tracking-[-0.04em]">{money(s.totalCents)}</Text>
                {s.deltaPct != null ? (
                  <View className={`rounded-[9px] px-2 py-[5px] ${s.deltaPct >= 0 ? 'bg-teal-soft' : 'bg-primary-soft'}`}>
                    <Text className={`text-xs font-extrabold ${s.deltaPct >= 0 ? 'text-teal' : 'text-primary-dark'}`}>
                      {s.deltaPct >= 0 ? '+' : ''}
                      {(s.deltaPct * 100).toFixed(1)}%
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="muted" className="-mt-1.5 text-xs">
                {s.count} {s.count === 1 ? 'pago' : 'pagos'} · contra el mes anterior
              </Text>
              <View className="h-[58px] flex-row items-end gap-[3px]">
                {s.byDay.map((d, i) => (
                  <View
                    key={d.date}
                    className="flex-1 rounded-t-[4px]"
                    style={{
                      height: `${Math.max((d.amountCents / maxDay) * 100, d.amountCents ? 6 : 3)}%`,
                      backgroundColor: d.amountCents ? barShade(t, i, s.byDay.length) : t.muted,
                    }}
                  />
                ))}
              </View>
              {s.totalCents > 0 ? (
                <>
                  <View className="h-3 flex-row overflow-hidden rounded-md">
                    {s.byMethod
                      .filter((m) => m.amountCents > 0)
                      .map((m) => (
                        <View key={m.method} style={{ width: `${(Number.isFinite(m.share) ? m.share : 0) * 100}%`, backgroundColor: METHOD[m.method].color }} />
                      ))}
                  </View>
                  <View className="flex-row flex-wrap gap-x-3 gap-y-1.5">
                    {s.byMethod.map((m) => (
                      <View key={m.method} className="w-[48%] flex-row items-center gap-[7px]">
                        <View className="h-[9px] w-[9px] rounded-[3px]" style={{ backgroundColor: METHOD[m.method].color }} />
                        <Text className="flex-1 text-xs font-semibold" numberOfLines={1}>
                          {METHOD[m.method].label}
                        </Text>
                        <Text className="font-mono-bold text-[11.5px]">{money(m.amountCents)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text variant="muted" className="text-xs">
                  Aún no hay cobros este mes.
                </Text>
              )}
            </View>

            {s.pending.length ? (
              <>
                <SectionHeader title={`Por confirmar · ${s.pending.length}`} />
                <View className="-mt-1.5">
                  {s.pending.map((t, i) => (
                    <View key={t.id}>
                      <View className="flex-row items-center gap-[11px] py-[9px]">
                        <Avatar uri={t.studentImage} name={t.studentName} size={38} />
                        <View className="min-w-0 flex-1 gap-0.5">
                          <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                            {t.studentName} · {t.concept}
                          </Text>
                          <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
                            {t.reference}
                            {t.trackingKey ? ` · rastreo ${t.trackingKey}` : ' · sin aviso aún'}
                          </Text>
                        </View>
                        <Text className="font-mono-bold text-[13px]">{money(t.amountCents)}</Text>
                        {canConfirm ? (
                          <>
                            <Pressable
                              onPress={() => decide(t.id, 'reject')}
                              disabled={resolve.isPending}
                              accessibilityLabel="Rechazar"
                              className="h-8 w-8 items-center justify-center rounded-[11px] bg-muted active:opacity-80"
                            >
                              <Icon as={X} size={16} color="#6B6270" strokeWidth={3} />
                            </Pressable>
                            <Pressable
                              onPress={() => decide(t.id, 'confirm')}
                              disabled={resolve.isPending}
                              accessibilityLabel="Confirmar"
                              className="h-8 w-8 items-center justify-center rounded-[11px] bg-teal active:opacity-80"
                            >
                              <Icon as={Check} size={17} color="#fff" strokeWidth={3} />
                            </Pressable>
                          </>
                        ) : null}
                      </View>
                      {i < s.pending.length - 1 ? <ListDivider /> : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {canCash ? (
              <Pressable
                onPress={() => router.push('/close-cash')}
                className="flex-row items-center gap-3 rounded-[22px] bg-ink px-3.5 py-[13px] active:opacity-90"
              >
                <IconTile icon={Banknote} tone="amber" size={38} />
                <View className="flex-1 gap-0.5">
                  <Text className="text-[11.5px] text-[#B9B2C0]">Efectivo por cerrar</Text>
                  <Text className="font-mono-bold text-[17px] leading-[17px] text-white">{money(s.cashPendingCents)}</Text>
                </View>
                <Text className="text-[12.5px] font-bold text-amber">Cerrar</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <SectionHeader title={term ? 'Resultados' : `Pagos de ${current ? monthLabel(current).split(' ')[0].toLowerCase() : 'este mes'}`} />
        <View className="-mt-1 h-[52px] flex-row items-center gap-2.5 rounded-[18px] border border-ink/[0.05] bg-card px-4 shadow-[0_1px_2px_rgba(16,32,26,0.04),0_10px_22px_-10px_rgba(16,32,26,0.14)]">
          <Icon as={Search} size={18} color="#A69DAB" />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por alumno, clase o paquete"
            className="h-12 flex-1 border-0 bg-transparent px-0 text-[14.5px] font-normal shadow-none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Limpiar búsqueda" className="h-7 w-7 items-center justify-center rounded-lg active:opacity-70">
              <Icon as={X} size={16} />
            </Pressable>
          ) : null}
        </View>
        {term ? (
          <Text variant="muted" className="-mt-1 text-xs">
            Buscando en todo el historial, no solo en el mes.
          </Text>
        ) : null}
        <QueryStatus q={list} />
        {list.data && payments.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
            <Text className="text-base font-extrabold">{term ? 'Sin resultados' : 'Sin pagos este mes'}</Text>
            <Text variant="muted" className="text-center">
              {term ? 'Prueba con otro nombre, clase o paquete.' : 'Cambia de mes con las flechas de arriba.'}
            </Text>
          </View>
        ) : null}
        <View>
          {payments.map((p, i) => (
            <View key={p.id}>
              <View className="flex-row items-center gap-[11px] py-[9px]">
                <Avatar uri={p.studentImage} name={p.studentName} size={38} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                    {p.studentName}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                    {p.concept} · {METHOD[p.method].label} · {dayLabel(p.paidAt ?? p.createdAt)}
                  </Text>
                  {p.reference ? (
                    <Text className="font-mono text-[10.5px] text-muted-foreground" numberOfLines={1}>
                      {p.reference}
                    </Text>
                  ) : null}
                </View>
                <View className="items-end gap-1">
                  <Text className="font-mono-bold text-[13px]">{money(p.amountCents)}</Text>
                  {p.status === 'PENDING' ? (
                    <Badge tone="amber">POR CONFIRMAR</Badge>
                  ) : p.status === 'REJECTED' ? (
                    <Badge tone="ink">RECHAZADO</Badge>
                  ) : p.status === 'REFUNDED' ? (
                    <Badge tone="ink">REEMBOLSADO</Badge>
                  ) : null}
                </View>
              </View>
              {i < payments.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
        <LoadMore q={list} label="Ver más pagos" />
      </ScreenScroll>
    </Screen>
  );
}
