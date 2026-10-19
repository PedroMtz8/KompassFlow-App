import { router, useLocalSearchParams } from 'expo-router';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import Clock from 'lucide-react-native/icons/clock';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useConfirmCheckout } from '@/features/payments/queries';
import { useTheme } from '@/lib/theme';

/** Destino al volver de Stripe tras pagar con tarjeta: confirma el pago y lleva a la membresía. */
export function PaymentResultScreen() {
  const t = useTheme();
  const { session_id, acct } = useLocalSearchParams<{ session_id?: string; acct?: string }>();
  const confirm = useConfirmCheckout();
  const started = useRef(false);

  useEffect(() => {
    if (!session_id || !acct || started.current) return;
    started.current = true;
    confirm.mutate({ sessionId: session_id, accountId: acct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id, acct]);

  const status = confirm.data?.status;
  const paid = status === 'paid' || status === 'already';
  const retry = () => session_id && acct && confirm.mutate({ sessionId: session_id, accountId: acct });

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        {!session_id || !acct || status === 'ignored' ? (
          <>
            <Text className="text-lg font-extrabold">No encontramos ese pago</Text>
            <Button variant="secondary" onPress={() => router.replace('/membership')}>
              <Text>Ir a mi membresía</Text>
            </Button>
          </>
        ) : confirm.isPending || confirm.isIdle ? (
          <>
            <ActivityIndicator />
            <Text variant="muted">Confirmando tu pago…</Text>
          </>
        ) : paid ? (
          <>
            <Icon as={CheckCircle2} size={52} color={t.teal} />
            <Text className="text-xl font-extrabold">¡Pago recibido!</Text>
            <Text variant="muted" className="text-center">
              {confirm.data?.concept ? `${confirm.data.concept} ya está activo en tu membresía.` : 'Tu paquete ya está activo en tu membresía.'}
            </Text>
            <Button size="lg" onPress={() => router.replace('/membership')}>
              <Text>Ver mi membresía</Text>
            </Button>
          </>
        ) : (
          <>
            <Icon as={Clock} size={48} color={t.amber} />
            <Text className="text-lg font-extrabold">Aún no vemos tu pago</Text>
            <Text variant="muted" className="text-center">
              {confirm.isError
                ? confirm.error.message
                : 'Si ya pagaste, puede tardar unos segundos. Si no completaste el pago, no se te cobró nada.'}
            </Text>
            <Button onPress={retry}>
              <Text>Volver a revisar</Text>
            </Button>
            <Button variant="secondary" onPress={() => router.replace('/membership')}>
              <Text>Ir a mi membresía</Text>
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}
