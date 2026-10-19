import { router } from 'expo-router';
import Repeat from 'lucide-react-native/icons/repeat';
import Ticket from 'lucide-react-native/icons/ticket';
import Zap from 'lucide-react-native/icons/zap';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FooterBar } from '@/components/ui/footer-bar';
import { ListDivider } from '@/components/ui/list-divider';
import { ListRow } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization, useOrganization } from '@/features/organizations/queries';
import { CardSetup } from '@/features/payments/card-setup';
import { usePaymentSettings, useProducts, useSavePaymentSettings } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';

const kindIcon = { SINGLE: Zap, PACKAGE: Ticket, MEMBERSHIP: Repeat } as const;
const kindTone = { SINGLE: 'teal', PACKAGE: 'orange', MEMBERSHIP: 'violet' } as const;
const kindNote = (p: { kind: 'SINGLE' | 'PACKAGE' | 'MEMBERSHIP'; credits: number | null; validityDays: number | null; seats: number }) =>
  (p.kind === 'SINGLE'
    ? 'Una clase'
    : p.kind === 'PACKAGE'
      ? `${p.credits} clases${p.validityDays ? ` · vigencia ${p.validityDays} días` : ''}`
      : `Ilimitada · ${p.validityDays} días`) + (p.kind !== 'SINGLE' && p.seats > 1 ? ` · ${p.seats} personas` : '');

type Form = { acceptsCash: boolean; acceptsTransfer: boolean; bank: string; clabe: string; beneficiary: string };

/** Precios y paquetes: productos que se cobran y cómo recibe pagos la academia. */
export function PricingScreen() {
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const products = useProducts(activeId);
  const settings = usePaymentSettings(activeId);
  const save = useSavePaymentSettings(activeId ?? '');
  const [edits, setEdits] = useState<Partial<Form>>({});
  const canEdit = can(org, 'product', 'update');
  const currency = detail.data?.currency ?? 'MXN';

  const form: Form | null = settings.data ? { ...settings.data, ...edits } : null;
  const dirty = Object.keys(edits).length > 0;
  const list = products.data ?? [];
  const active = list.filter((p) => p.isActive);

  const submit = () => {
    if (!form) return;
    save.mutate(form, {
      onSuccess: () => {
        setEdits({});
        done('Datos de cobro guardados');
      },
      onError: (e) => done(e.message),
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Precios y paquetes" subtitle={org?.name} />
      <ScreenScroll contentContainerClassName="gap-2.5" keyboardShouldPersistTaps="handled">
        <StatCard
          title="Resumen"
          icon={Repeat}
          tone="violet"
          stats={[
            { value: String(active.length), label: 'productos' },
            { value: String(list.reduce((a, p) => a + Number(p.activePasses), 0)), label: 'pases vigentes' },
            { value: String(list.reduce((a, p) => a + Number(p.soldThisMonth), 0)), label: 'ventas del mes' },
          ]}
        />

        <SectionHeader title="Productos" className="pt-1" />
        <QueryStatus q={products} />
        {!products.isPending && !products.isError && list.length === 0 ? (
          <Text variant="muted">Aún no tienes productos. Crea una clase suelta, un paquete o una mensualidad para empezar a cobrar.</Text>
        ) : null}
        {list.map((p) => (
          <ListRow
            key={p.id}
            icon={kindIcon[p.kind]}
            tone={p.isActive ? kindTone[p.kind] : 'ink'}
            title={p.name}
            note={kindNote(p)}
            badge={!p.isActive ? <Badge tone="ink">PAUSADO</Badge> : !p.isVisible ? <Badge tone="amber">OCULTO</Badge> : undefined}
            trailing={
              <View className="items-end gap-[3px]">
                <Text variant="mono" className="text-[14.5px]">
                  {formatMoney(p.priceCents, currency)}
                </Text>
                <Text className="text-[11px] font-bold text-muted-foreground">{Number(p.activePasses)} vigentes</Text>
              </View>
            }
            onPress={canEdit ? () => router.push({ pathname: '/new-product', params: { productId: p.id } }) : undefined}
          />
        ))}

        <SectionHeader title="Cómo cobras" className="pt-1" />
        {form ? (
          <View className="gap-1 rounded-[22px] bg-card px-3.5 py-1 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
            <View className="flex-row items-center gap-3 py-2.5">
              <View className="flex-1 gap-0.5">
                <Text className="text-[13.5px] font-bold">Pago en efectivo</Text>
                <Text className="text-[11.5px] text-muted-foreground">Se cobra en recepción y entra al corte de caja</Text>
              </View>
              <Toggle value={form.acceptsCash} onValueChange={(v) => canEdit && setEdits({ ...edits, acceptsCash: v })} />
            </View>
            <ListDivider />
            <View className="flex-row items-center gap-3 py-2.5">
              <View className="flex-1 gap-0.5">
                <Text className="text-[13.5px] font-bold">Transferencia (SPEI)</Text>
                <Text className="text-[11.5px] text-muted-foreground">La persona transfiere y tú confirmas el pago</Text>
              </View>
              <Toggle value={form.acceptsTransfer} onValueChange={(v) => canEdit && setEdits({ ...edits, acceptsTransfer: v })} />
            </View>
            {form.acceptsTransfer ? (
              <View className="gap-2.5 pb-3 pt-1">
                <Field
                  label="CLABE (18 dígitos)"
                  value={form.clabe}
                  onChangeText={(clabe) => setEdits({ ...edits, clabe: clabe.replace(/[^\d\s]/g, '') })}
                  keyboardType="number-pad"
                  maxLength={24}
                  editable={canEdit}
                />
                <Field
                  label="Banco"
                  value={form.bank}
                  onChangeText={(bank) => setEdits({ ...edits, bank })}
                  maxLength={60}
                  editable={canEdit}
                />
                <Field
                  label="Beneficiario"
                  value={form.beneficiary}
                  onChangeText={(beneficiary) => setEdits({ ...edits, beneficiary })}
                  maxLength={100}
                  editable={canEdit}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <ActivityIndicator />
        )}
        {activeId ? <CardSetup orgId={activeId} org={org} /> : null}
        {canEdit && dirty ? (
          <Button variant="secondary" onPress={submit} disabled={save.isPending}>
            <Text>{save.isPending ? 'Guardando…' : 'Guardar datos de cobro'}</Text>
          </Button>
        ) : null}
      </ScreenScroll>
      {canEdit ? (
        <FooterBar>
          <Button size="lg" onPress={() => router.push('/new-product')}>
            <Text className="text-[15.5px]">Nuevo producto</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}
