import { router } from 'expo-router';
import Banknote from 'lucide-react-native/icons/banknote';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Landmark from 'lucide-react-native/icons/landmark';
import Receipt from 'lucide-react-native/icons/receipt';
import Repeat from 'lucide-react-native/icons/repeat';
import Ticket from 'lucide-react-native/icons/ticket';
import Zap from 'lucide-react-native/icons/zap';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Gradient } from '@/components/ui/gradient';
import { IconTile } from '@/components/ui/icon-tile';
import { ListDivider } from '@/components/ui/list-divider';
import { ListRow } from '@/components/ui/list-row';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SectionDivider } from '@/components/ui/section-divider';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useMyMembership, usePublicProducts } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { useTheme } from '@/lib/theme';
import { useIsDesktop } from '@/lib/use-layout';
import { cardToneFor } from '@/features/session/switch-space-screen';
import { done } from '@/lib/simulate';

const kindIcon = { SINGLE: Zap, PACKAGE: Ticket, MEMBERSHIP: Repeat } as const;
const kindTone = {
  SINGLE: 'teal',
  PACKAGE: 'orange',
  MEMBERSHIP: 'violet',
} as const;

type PassItem = NonNullable<ReturnType<typeof useMyMembership>['data']>['passes'][number];

const dateLabel = (d: Date | string | null) =>
  d
    ? new Intl.DateTimeFormat('es-MX', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(d))
    : '';

/** Productos de una academia donde ya eres alumno: renovar o comprar. */
function OrgProducts({ orgId, orgName }: { orgId: string; orgName: string }) {
  const q = usePublicProducts(orgId);
  const d = q.data;
  if (!d?.products.length) return null;
  return (
    <>
      <SectionHeader title="Comprar o renovar" className="pt-1" />
      {d.products.map((p) => (
        <ListRow
          key={p.id}
          icon={kindIcon[p.kind]}
          tone={kindTone[p.kind]}
          title={p.name}
          note={
            (p.kind === 'SINGLE'
              ? 'Una clase'
              : p.kind === 'PACKAGE'
                ? `${p.credits} clases${p.validityDays ? ` · ${p.validityDays} días` : ''}`
                : `Ilimitada · ${p.validityDays} días`) + (p.kind !== 'SINGLE' && p.seats > 1 ? ` · para ${p.seats} personas` : '')
          }
          trailing={
            <Text variant="mono" className="text-sm">
              {formatMoney(p.priceCents, d.currency)}
            </Text>
          }
          onPress={() =>
            d.acceptsCard || d.acceptsTransfer
              ? router.push({
                  pathname: '/buy',
                  params: { orgId, productId: p.id },
                })
              : done(`Paga en recepción de ${orgName}`)
          }
        />
      ))}
    </>
  );
}

/** Varios paquetes de créditos de una misma academia, sumados en una sola tarjeta (con el detalle de cada uno debajo). */
function CreditsCard({ passes }: { passes: PassItem[] }) {
  const remaining = passes.reduce((a, p) => a + (p.remaining ?? 0), 0);
  const used = passes.reduce((a, p) => a + p.used, 0);
  const total = passes.reduce((a, p) => a + (p.creditsTotal ?? 0), 0);
  const soonest = passes.filter((p) => p.expiresAt).sort((a, b) => +new Date(a.expiresAt!) - +new Date(b.expiresAt!))[0];
  return (
    <Gradient tone={cardToneFor(passes[0].organizationId)} style={{ borderRadius: 26, padding: 15, gap: 12 }}>
      <View className="flex-row items-center gap-2.5">
        <IconTile icon={CreditCard} size={34} glass />
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-white">Tus créditos</Text>
          <Text className="text-[11.5px] text-white/80">{passes.length} paquetes sumados</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        {[
          { v: String(remaining), l: 'créditos restantes' },
          { v: String(used), l: 'usados' },
          {
            v: soonest?.daysLeft != null ? String(soonest.daysLeft) : '—',
            l: soonest?.expiresAt ? `días · vence el primero ${dateLabel(soonest.expiresAt)}` : 'sin vencimiento',
          },
        ].map((x) => (
          <View key={x.l} className="flex-1 gap-[3px]">
            <Text className="font-mono-bold text-[28px] leading-[28px] tracking-[-0.04em] text-white">{x.v}</Text>
            <Text className="text-[11.5px] font-semibold text-white/90">{x.l}</Text>
          </View>
        ))}
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-white/30">
        <View
          className="h-full rounded-full bg-white"
          style={{ width: `${total ? Math.min((total - remaining) / total, 1) * 100 : 0}%` }}
        />
      </View>
      <View className="gap-1.5 border-t border-white/25 pt-2.5">
        {passes.map((p) => (
          <View key={p.id} className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-[12.5px] font-semibold text-white" numberOfLines={1}>
              {p.name}
            </Text>
            <Text className="text-[12px] text-white/90">
              {p.remaining} {p.remaining === 1 ? 'crédito' : 'créditos'} ·{' '}
              {p.expiresAt ? `vence ${dateLabel(p.expiresAt)}` : 'sin vencimiento'}
            </Text>
          </View>
        ))}
      </View>
    </Gradient>
  );
}

/** Un pase activo: créditos, usados y vencimiento. */
function PassCard({ p }: { p: PassItem }) {
  const unlimited = p.creditsTotal == null;
  const ratio = unlimited ? 1 : p.creditsTotal ? (p.creditsTotal - (p.remaining ?? 0)) / p.creditsTotal : 0;
  return (
    <Gradient tone={cardToneFor(p.organizationId)} style={{ borderRadius: 26, padding: 15, gap: 12 }}>
      <View className="flex-row items-center gap-2.5">
        <IconTile icon={CreditCard} size={34} glass />
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-white" numberOfLines={1}>
            {p.name}
          </Text>
          <Text className="text-[11.5px] text-white/80">{unlimited ? 'Ilimitada' : 'Por créditos'}</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        {[
          {
            v: unlimited ? '∞' : String(p.remaining),
            l: unlimited ? 'clases' : 'créditos restantes',
          },
          { v: String(p.used), l: 'usados' },
          {
            v: p.daysLeft != null ? String(p.daysLeft) : '—',
            l: p.expiresAt ? `días · vence ${dateLabel(p.expiresAt)}` : 'sin vencimiento',
          },
        ].map((s) => (
          <View key={s.l} className="flex-1 gap-[3px]">
            <Text className="font-mono-bold text-[28px] leading-[28px] tracking-[-0.04em] text-white">{s.v}</Text>
            <Text className="text-[11.5px] font-semibold text-white/90">{s.l}</Text>
          </View>
        ))}
      </View>
      {p.seats > 1 ? (
        <Text className="text-[12px] font-semibold text-white/90">
          Compartido con{' '}
          {p.members
            .filter((m) => m.studentId !== p.viewerStudentId)
            .map((m) => m.name.split(' ')[0])
            .join(', ') || 'nadie aún'}
          {p.vacant > 0 ? ` · ${p.vacant} ${p.vacant === 1 ? 'lugar libre' : 'lugares libres'}` : ''}
        </Text>
      ) : null}
      {!unlimited ? (
        <View className="h-2 overflow-hidden rounded-full bg-white/30">
          <View className="h-full rounded-full bg-white" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
        </View>
      ) : null}
    </Gradient>
  );
}

/** Mis pases: pases (créditos y mensualidades), compras y pagos de todas mis academias. */
export function MembershipScreen() {
  const q = useMyMembership();
  const desktop = useIsDesktop();
  const theme = useTheme();
  const refresh = useCallback(() => q.refetch(), [q]);
  const passes = q.data?.passes ?? [];
  const payments = q.data?.payments ?? [];
  const active = passes.filter((p) => p.active);
  // Un bloque por academia: sus pases activos, lo que se puede comprar y sus pagos. Primero las que tienen pases activos.
  const blocks = [...new Map([...passes, ...payments].map((x) => [x.organizationId, x.organizationName])).entries()]
    .map(([id, name]) => ({
      id,
      name,
      logo: passes.find((p) => p.organizationId === id)?.organizationLogo ?? null,
      passes: active.filter((p) => p.organizationId === id),
      payments: payments.filter((p) => p.organizationId === id),
    }))
    .sort((x, y) => y.passes.length - x.passes.length);

  return (
    <Screen>
      <ScreenScroll contentContainerClassName="gap-3 pb-6" onRefresh={refresh}>
        <View className="flex-row items-center justify-between pb-1.5 pt-1">
          <Text variant="h2">Mis pases</Text>
          {desktop ? <RefreshButton onPress={refresh} busy={q.isFetching} /> : null}
        </View>

        <QueryStatus q={q} />
        {q.data && active.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[24px] border border-ink/[0.045] bg-card p-6 shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
            <Text className="text-base font-extrabold">Aún no tienes un paquete activo</Text>
            <Text variant="muted" className="text-center">
              Compra uno en el perfil de tu academia o pídelo en recepción; cuando se registre el pago, aquí verás tus créditos.
            </Text>
          </View>
        ) : null}

        {blocks.map((o, i) => (
          <View key={o.id} className="gap-2.5">
            {i > 0 ? <SectionDivider /> : null}
            <Pressable
              onPress={() => router.push({ pathname: '/org/[id]', params: { id: o.id } })}
              className="flex-row items-center gap-3 active:opacity-80"
            >
              <Avatar uri={o.logo} name={o.name} size={48} radius={16} />
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-extrabold tracking-[-0.02em]" numberOfLines={1}>
                  {o.name}
                </Text>
                <Text variant="muted" className="text-xs">
                  {o.passes.length ? `${o.passes.length} ${o.passes.length === 1 ? 'pase activo' : 'pases activos'}` : 'Sin pases activos'}
                </Text>
              </View>
            </Pressable>
            {(() => {
              // Los paquetes de créditos individuales de una academia se suman en una sola tarjeta; las mensualidades y los compartidos van aparte.
              const pooled = o.passes.filter((p) => p.creditsTotal != null && p.seats === 1);
              const merge = pooled.length > 1;
              return (
                <>
                  {merge ? <CreditsCard passes={pooled} /> : null}
                  {o.passes
                    .filter((p) => !merge || !pooled.includes(p))
                    .map((p) => (
                      <PassCard key={p.id} p={p} />
                    ))}
                </>
              );
            })()}
            <OrgProducts orgId={o.id} orgName={o.name} />
            {o.payments.length ? <SectionHeader title="Pagos" className="pt-1" /> : null}
            <View>
              {o.payments.slice(0, 3).map((p, j, list) => (
                <View key={p.id}>
                  <ListRow
                    variant="soft"
                    icon={p.method === 'CASH' ? Banknote : p.method === 'TRANSFER' ? Landmark : CreditCard}
                    tone={p.method === 'CASH' ? 'amber' : p.method === 'TRANSFER' ? 'ink' : 'violet'}
                    title={p.concept}
                    note={dateLabel(p.paidAt ?? p.createdAt)}
                    badge={
                      p.status === 'PENDING' ? (
                        <Badge tone="amber">POR CONFIRMAR</Badge>
                      ) : p.status === 'REJECTED' ? (
                        <Badge tone="ink">RECHAZADO</Badge>
                      ) : p.status === 'REFUNDED' ? (
                        <Badge tone="ink">REEMBOLSADO</Badge>
                      ) : undefined
                    }
                    trailing={<Text className="font-mono-bold text-[13px]">{formatMoney(p.amountCents, p.currency)}</Text>}
                    onPress={
                      p.status === 'PENDING' && p.method === 'TRANSFER'
                        ? () =>
                            router.push({
                              pathname: '/transfer',
                              params: { paymentId: p.id },
                            })
                        : undefined
                    }
                  />
                  {j < list.length - 1 ? <ListDivider /> : null}
                </View>
              ))}
            </View>
            {o.payments.length > 3 ? (
              <Pressable onPress={() => router.push('/payment-history')} className="items-center py-1.5 active:opacity-70">
                <Text className="text-[13px] font-bold text-primary">Ver todos los pagos</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {blocks.length ? (
          <Pressable
            onPress={() => router.push('/payment-history')}
            className="flex-row items-center justify-center gap-2 rounded-2xl bg-card py-3.5 active:opacity-80"
          >
            <Receipt size={17} color={theme.foreground} />
            <Text className="text-[13.5px] font-bold">Historial de pagos de todas mis academias</Text>
          </Pressable>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
