import { router, useLocalSearchParams } from 'expo-router';
import Banknote from 'lucide-react-native/icons/banknote';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Landmark from 'lucide-react-native/icons/landmark';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { FormScreen } from '@/components/form-screen';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { OptionRow } from '@/components/ui/option-row';
import { Text } from '@/components/ui/text';
import { useCardCheckout, useMyMembership, usePublicProducts } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';
import { useTheme } from '@/lib/theme';

type Method = 'card' | 'transfer' | 'cash';

/** Comprar un paquete o mensualidad: elegir cómo pagar (tarjeta, transferencia o en recepción). */
export function BuyScreen() {
  const t = useTheme();
  const { orgId, productId } = useLocalSearchParams<{ orgId: string; productId: string }>();
  const q = usePublicProducts(orgId);
  const card = useCardCheckout();
  const mine = useMyMembership();
  const [picked, setPicked] = useState<Method | null>(null);
  const d = q.data;
  const p = d?.products.find((x) => x.id === productId);

  if (q.isPending) {
    return (
      <FormScreen title="Pagar" cta="Continuar" onSubmit={() => {}} disabled>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (q.isError) return <ErrorNotice fill what="el producto" busy={q.isFetching} onRetry={q.refetch} />;
  if (!d || !p) {
    return (
      <FormScreen title="Pagar" cta="Volver" onSubmit={() => router.back()}>
        <Text variant="muted">Este producto ya no está disponible.</Text>
      </FormScreen>
    );
  }

  const options: { id: Method; title: string; note: string; icon: typeof CreditCard }[] = [
    ...(d.acceptsCard ? [{ id: 'card' as const, title: 'Tarjeta', note: 'Débito o crédito · pagas ahora y tu paquete queda activo al instante', icon: CreditCard }] : []),
    ...(d.acceptsTransfer ? [{ id: 'transfer' as const, title: 'Transferencia (SPEI)', note: 'La academia confirma tu pago cuando llegue', icon: Landmark }] : []),
    ...(d.acceptsCash ? [{ id: 'cash' as const, title: 'En recepción', note: 'Efectivo o terminal al llegar a la academia', icon: Banknote }] : []),
  ];
  const method = picked ?? options[0]?.id ?? null;

  // Aviso (no bloqueo: renovar antes de tiempo es legítimo) si ya tiene algo vigente en esta academia. Un pase nuevo empieza al pagarse, no al terminar el actual.
  const date = (x: Date | string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(new Date(x));
  const active = (mine.data?.passes ?? []).filter((x) => x.active && x.organizationId === orgId);
  const unlimited = active.find((x) => x.creditsTotal == null);
  const withCredits = active.filter((x) => x.creditsTotal != null && (x.remaining ?? 0) > 0);
  const already =
    p.kind === 'SINGLE'
      ? null
      : p.kind === 'MEMBERSHIP' && unlimited
        ? `Ya tienes ${unlimited.name} vigente${unlimited.expiresAt ? ` hasta el ${date(unlimited.expiresAt)}` : ''}. Si compras otra, empieza hoy y corren al mismo tiempo: no se suma al final.`
        : withCredits.length
          ? `Aún tienes ${withCredits.reduce((a, x) => a + (x.remaining ?? 0), 0)} créditos de ${withCredits[0].name}. Se usan primero los que vencen antes; puedes comprar otro paquete si quieres más clases.`
          : unlimited
            ? `Ya tienes ${unlimited.name} vigente${unlimited.expiresAt ? ` hasta el ${date(unlimited.expiresAt)}` : ''}: con él puedes tomar clases sin gastar créditos.`
            : null;

  const submit = () => {
    if (method === 'card') card.mutate(p.id, { onError: (e) => done(e.message) });
    else if (method === 'transfer') router.replace({ pathname: '/transfer', params: { productId: p.id } });
    else done('Paga en recepción y la academia registrará tu pago.');
  };

  return (
    <FormScreen
      title="Pagar"
      subtitle={p.name}
      cta={card.isPending ? 'Abriendo pago…' : method === 'card' ? `Pagar ${formatMoney(p.priceCents, d.currency)}` : method === 'transfer' ? 'Continuar' : 'Entendido'}
      onSubmit={submit}
      disabled={!method}
    >
      <View className="gap-1 rounded-[22px] bg-ink p-4">
        <Text className="text-base font-extrabold text-white">{p.name}</Text>
        <Text className="font-mono-bold pt-1 text-lg text-white">{formatMoney(p.priceCents, d.currency)}</Text>
      </View>
      {already ? <InfoBanner icon={TriangleAlert} tone="amber" text={already} /> : null}
      <Text className="pt-1 text-[15px] font-extrabold">¿Cómo quieres pagar?</Text>
      {options.length === 0 ? <Text variant="muted">Esta academia aún no tiene formas de pago en línea. Pregunta en recepción.</Text> : null}
      {options.map((o) => (
        <OptionRow
          key={o.id}
          title={o.title}
          note={o.note}
          selected={method === o.id}
          onPress={() => setPicked(o.id)}
          leading={
            <View className="h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-primary-soft">
              <Icon as={o.icon} size={18} color={t.primary} />
            </View>
          }
        />
      ))}
      {method === 'card' ? <InfoBanner icon={ShieldCheck} tone="teal" text="Pagas en la página segura de Stripe. La academia nunca ve los datos de tu tarjeta." /> : null}
    </FormScreen>
  );
}
