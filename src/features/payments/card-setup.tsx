import CreditCard from 'lucide-react-native/icons/credit-card';
import { ActivityIndicator, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { can } from '@/features/organizations/permissions';
import { useConnect, useConnectActions } from '@/features/payments/queries';
import { done } from '@/lib/simulate';

/**
 * Cobro con tarjeta de los alumnos: la academia conecta su cuenta de Stripe (Connect) y el dinero le llega a su banco.
 * Solo la persona propietaria conecta o abre el panel; el resto ve el estado.
 */
export function CardSetup({ orgId, org }: { orgId: string; org: { permissions?: Record<string, string[]> } | null | undefined }) {
  const q = useConnect(orgId);
  const act = useConnectActions(orgId);
  const owner = can(org, 'plan', 'manage');
  const s = q.data;
  const onError = (e: Error) => done(e.message);

  if (q.isError) return <ErrorNotice what="el cobro con tarjeta" busy={q.isFetching} onRetry={q.refetch} />;
  if (q.isPending) return <ActivityIndicator />;
  // Sin Stripe configurado en el servidor (desarrollo sin llaves) la opción no existe.
  if (!s || !s.available) return null;

  const ready = s.connected && s.chargesEnabled;
  const pending = s.connected && !ready;
  return (
    <View className="gap-3 rounded-[22px] bg-card p-3.5 border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]">
      <View className="flex-row items-center gap-3">
        <IconTile icon={CreditCard} tone={ready ? 'teal' : 'violet'} size={38} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-[13.5px] font-bold">Pago con tarjeta</Text>
          <Text className="text-[11.5px] text-muted-foreground">
            {ready
              ? s.payoutsEnabled
                ? 'Tus alumnos pagan desde la app y el dinero llega a tu cuenta bancaria.'
                : 'Ya puedes cobrar. Falta confirmar tu cuenta bancaria para recibir los depósitos.'
              : pending
                ? 'Falta terminar el registro con Stripe para poder cobrar.'
                : 'Tus alumnos pagan con tarjeta desde la app y el dinero llega a tu banco. El registro con Stripe toma unos minutos.'}
          </Text>
        </View>
        {ready ? <Badge tone="teal">ACTIVO</Badge> : pending ? <Badge tone="amber">INCOMPLETO</Badge> : null}
      </View>
      {owner ? (
        ready ? (
          <Button variant="secondary" disabled={act.dashboard.isPending} onPress={() => act.dashboard.mutate(undefined, { onError })}>
            <Text>{act.dashboard.isPending ? 'Abriendo…' : 'Ver pagos y depósitos en Stripe'}</Text>
          </Button>
        ) : (
          <Button variant="dark" disabled={act.onboard.isPending} onPress={() => act.onboard.mutate(undefined, { onError })}>
            <Text>{act.onboard.isPending ? 'Abriendo Stripe…' : pending ? 'Continuar registro' : 'Conectar con Stripe'}</Text>
          </Button>
        )
      ) : !ready ? (
        <Text variant="muted" className="text-xs">
          Solo la persona propietaria puede activar el cobro con tarjeta.
        </Text>
      ) : null}
    </View>
  );
}
