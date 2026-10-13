import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Clock, Copy, Send, Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { MoneyCard } from '@/components/ui/money-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useMyTransfer, useRequestTransfer } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { goBack } from '@/lib/nav';

function CopyRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(value.replace(/\s/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View className="flex-row items-center justify-between gap-2.5">
      <Text className="text-xs text-[#B9B2C0]">{label}</Text>
      <Pressable onPress={copyable ? copy : undefined} disabled={!copyable} className="flex-row items-center gap-2">
        <Text className="font-mono-bold text-sm text-white">{value}</Text>
        {copyable ? <Icon as={copied ? Check : Copy} size={15} color={copied ? t.tealLight : t.subtle} /> : null}
      </Pressable>
    </View>
  );
}

function Steps({ state }: { state: 'sent' | 'notified' | 'paid' }) {
  const t = useTheme();
  const steps = [
    { label: 'Referencia', state: 'done' as const },
    { label: 'Transferencia', state: state === 'sent' ? ('current' as const) : ('done' as const) },
    { label: 'Confirmado', state: state === 'paid' ? ('done' as const) : state === 'notified' ? ('current' as const) : ('todo' as const) },
  ];
  return (
    <View className="flex-row pt-0.5">
      <View className="absolute left-[16%] right-[16%] top-[17px] h-[3px] flex-row overflow-hidden rounded-[3px]">
        <View className="flex-1 bg-teal" />
        <View className={state === 'sent' ? 'flex-1 bg-border' : 'flex-1 bg-teal'} />
      </View>
      {steps.map((s) => (
        <View key={s.label} className="flex-1 items-center gap-1.5">
          <View
            className="h-[30px] w-[30px] items-center justify-center rounded-full"
            style={{ backgroundColor: s.state === 'done' ? t.teal : s.state === 'current' ? t.amber : t.border }}
          >
            <Icon as={s.state === 'current' ? Clock : Check} size={16} color={s.state === 'todo' ? t.subtle : '#fff'} strokeWidth={2.5} />
          </View>
          <Text className={s.state === 'todo' ? 'text-[11.5px] font-bold text-subtle' : 'text-[11.5px] font-bold'}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Pagar por transferencia: se genera una referencia, la persona transfiere y la academia confirma el pago. */
export function TransferScreen() {
  const { productId, paymentId } = useLocalSearchParams<{ productId?: string; paymentId?: string }>();
  const existing = useMyTransfer(paymentId);
  const request = useRequestTransfer();

  // Paso 1: todavía no hay referencia; se muestra el producto y se genera al confirmar.
  if (!paymentId) return <NewTransfer productId={productId} request={request} />;

  if (existing.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Pagar por transferencia" />
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }
  const t = existing.data;
  if (!t) {
    return (
      <Screen>
        <ScreenHeader title="Pagar por transferencia" />
        <ScreenScroll>
          <Text variant="muted">No encontramos este pago.</Text>
        </ScreenScroll>
      </Screen>
    );
  }
  const paid = t.status === 'PAID';
  const rejected = t.status === 'REJECTED';

  return (
    <Screen>
      <ScreenHeader title="Pagar por transferencia" subtitle={`${t.concept} · ${t.organizationName}`} />
      <ScreenScroll contentContainerClassName="gap-3.5">
        <Steps state={paid ? 'paid' : t.trackingKey ? 'notified' : 'sent'} />
        <MoneyCard label="Monto exacto" amount={formatMoney(t.amountCents, t.currency)} className="gap-3.5 p-[18px]">
          <View className="h-px bg-white/[0.12]" />
          <CopyRow label="CLABE" value={t.clabe} copyable />
          <CopyRow label="Banco" value={t.bank || '—'} />
          <CopyRow label="Beneficiario" value={t.beneficiary} />
          <CopyRow label="Referencia / concepto" value={t.reference ?? ''} copyable />
        </MoneyCard>
        {paid ? <InfoBanner icon={Check} tone="teal" text="¡Pago confirmado! Tu paquete ya está en Membresía." /> : null}
        {rejected ? (
          <InfoBanner icon={X} tone="amber" text="La academia no encontró este pago. Contáctala o genera una nueva referencia." />
        ) : null}
        {!paid && !rejected ? (
          <InfoBanner
            icon={Clock}
            tone="amber"
            text={
              t.trackingKey
                ? 'Avisaste tu transferencia. La academia la confirmará en cuanto la vea en su banco.'
                : 'Escribe la referencia como concepto de tu transferencia y avisa cuando la hagas.'
            }
          />
        ) : null}
      </ScreenScroll>
      <FooterBar className="gap-2.5">
        {!paid && !rejected ? (
          <Button size="lg" onPress={() => router.push({ pathname: '/upload-receipt', params: { paymentId: t.id } })}>
            <Icon as={t.trackingKey ? Upload : Send} size={19} color="#fff" />
            <Text className="text-[15.5px]">{t.trackingKey ? 'Actualizar aviso' : 'Ya transferí'}</Text>
          </Button>
        ) : (
          <Button size="lg" onPress={() => router.replace('/membership')}>
            <Text className="text-[15.5px]">Ir a mi membresía</Text>
          </Button>
        )}
        <Pressable onPress={() => goBack()} className="items-center py-1">
          <Text className="text-[13px] font-bold text-muted-foreground">Volver</Text>
        </Pressable>
      </FooterBar>
    </Screen>
  );
}

function NewTransfer({ productId, request }: { productId?: string; request: ReturnType<typeof useRequestTransfer> }) {
  return (
    <Screen>
      <ScreenHeader title="Pagar por transferencia" />
      <ScreenScroll contentContainerClassName="gap-3.5">
        <InfoBanner
          icon={Clock}
          tone="amber"
          text="Te daremos una referencia única y los datos bancarios. Cuando transfieras, avisa aquí; la academia confirmará tu pago y se activará tu paquete."
        />
      </ScreenScroll>
      <FooterBar className="gap-2.5">
        <Button
          size="lg"
          disabled={!productId || request.isPending}
          onPress={() =>
            request.mutate(productId!, {
              onSuccess: (r) => router.replace({ pathname: '/transfer', params: { paymentId: r.id } }),
              onError: (e) => done(e.message),
            })
          }
        >
          <Text className="text-[15.5px]">{request.isPending ? 'Generando…' : 'Generar datos de pago'}</Text>
        </Button>
        <Pressable onPress={() => goBack()} className="items-center py-1">
          <Text className="text-[13px] font-bold text-muted-foreground">Cancelar</Text>
        </Pressable>
      </FooterBar>
    </Screen>
  );
}
