import { useState } from 'react';
import { router } from 'expo-router';

import { FormGroup, FormScreen } from '@/components/form-screen';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useRedeemLinkCode } from '@/features/bookings/queries';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

/** La persona escribe el código que le dio su academia para unir su historial a su cuenta. */
export function RedeemCodeScreen() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const redeem = useRedeemLinkCode();

  return (
    <FormScreen
      title="Código de mi academia"
      subtitle="Une tu historial a tu cuenta"
      cta={redeem.isPending ? 'Vinculando…' : 'Vincular'}
      disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 8 || redeem.isPending}
      onSubmit={() =>
        redeem.mutate(code, {
          onSuccess: (r) => {
            done(`Vinculado con ${r.organizationName}`);
            router.replace('/my-classes');
          },
          onError: (e) => setError(e.message),
        })
      }
      secondary={{ label: 'Cancelar', onPress: () => goBack() }}
    >
      <FormGroup label="CÓDIGO">
        <Input
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          className="h-14 text-center font-mono-bold text-xl tracking-[0.12em]"
        />
      </FormGroup>
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
      <Text variant="muted" className="text-xs">
        Pídelo en recepción de tu academia. Es de un solo uso y vence en 7 días.
      </Text>
    </FormScreen>
  );
}
