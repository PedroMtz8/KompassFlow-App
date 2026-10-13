import { router } from 'expo-router';
import { Banknote, Landmark, CreditCard } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useMyMembership, useMyPaymentHistory } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/lib/theme';

const METHOD = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' } as const;
const METHOD_ICON = { CASH: Banknote, TRANSFER: Landmark, CARD: CreditCard, OTHER: Banknote } as const;

const monthKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (d: Date | string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(d));

/** Historial de pagos de la persona en todas sus academias, por mes; con filtro por academia. */
export function PaymentHistoryScreen() {
  const t = useTheme();
  const [org, setOrg] = useState<string | undefined>();
  const q = useMyPaymentHistory(org);
  const mine = useMyMembership();
  const orgs = [...new Map([...(mine.data?.passes ?? []), ...(mine.data?.payments ?? [])].map((x) => [x.organizationId, x.organizationName])).entries()];
  const rows = q.data ?? [];

  // Agrupa por mes manteniendo el orden (más reciente primero). El total del mes solo suma lo cobrado.
  const months: { key: string; items: typeof rows }[] = [];
  for (const p of rows) {
    const key = monthKey(p.paidAt ?? p.createdAt);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(p);
    else months.push({ key, items: [p] });
  }

  return (
    <Screen>
      <ScreenHeader title="Historial de pagos" subtitle="Todas tus academias" />
      <ScreenScroll contentContainerClassName="gap-3 pb-10">
        {orgs.length > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Todas" selected={!org} onPress={() => setOrg(undefined)} />
            {orgs.map(([id, name]) => (
              <Chip key={id} label={name} selected={org === id} onPress={() => setOrg(id)} />
            ))}
          </View>
        ) : null}

        <QueryStatus q={q} />
        {q.data && rows.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[22px] bg-card p-6">
            <Text className="text-base font-extrabold">Aún no tienes pagos</Text>
            <Text variant="muted" className="text-center">
              Cuando pagues un paquete o una mensualidad, aquí quedará el registro.
            </Text>
          </View>
        ) : null}

        {months.map((m) => {
          const paid = m.items.filter((p) => p.status === 'PAID');
          const currencies = new Set(paid.map((p) => p.currency));
          return (
            <View key={m.key} className="gap-1">
              <View className="flex-row items-baseline justify-between pt-2">
                <Text className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{monthLabel(m.key)}</Text>
                {paid.length && currencies.size === 1 ? (
                  <Text className="font-mono-bold text-[12.5px] text-muted-foreground">{formatMoney(paid.reduce((a, p) => a + p.amountCents, 0), paid[0].currency)}</Text>
                ) : null}
              </View>
              {m.items.map((p, i) => {
                const pending = p.status === 'PENDING' && p.method === 'TRANSFER';
                return (
                  <View key={p.id}>
                    <Pressable
                      disabled={!pending}
                      onPress={() => router.push({ pathname: '/transfer', params: { paymentId: p.id } })}
                      className="flex-row items-center gap-3 py-[9px] active:opacity-80"
                    >
                      <Avatar uri={p.organizationLogo} name={p.organizationName} size={42} radius={14} />
                      <View className="min-w-0 flex-1 gap-[3px]">
                        <Text className="text-sm font-bold" numberOfLines={1}>
                          {p.concept}
                        </Text>
                        <View className="flex-row items-center gap-1.5">
                          <Icon as={METHOD_ICON[p.method]} size={12} color={t.subtle} />
                          <Text className="flex-1 text-[11.5px] text-muted-foreground" numberOfLines={1}>
                            <Text className="text-[11.5px] font-bold text-foreground">{p.organizationName}</Text> · {METHOD[p.method]} · {dayLabel(p.paidAt ?? p.createdAt)}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end gap-1">
                        <Text className="font-mono-bold text-[13px]">{formatMoney(p.amountCents, p.currency)}</Text>
                        {p.status === 'PENDING' ? (
                          <Badge tone="amber">POR CONFIRMAR</Badge>
                        ) : p.status === 'REJECTED' ? (
                          <Badge tone="ink">RECHAZADO</Badge>
                        ) : p.status === 'REFUNDED' ? (
                          <Badge tone="ink">REEMBOLSADO</Badge>
                        ) : null}
                      </View>
                    </Pressable>
                    {i < m.items.length - 1 ? <ListDivider /> : null}
                  </View>
                );
              })}
            </View>
          );
        })}
        <LoadMore q={q} label="Ver pagos anteriores" />
      </ScreenScroll>
    </Screen>
  );
}
