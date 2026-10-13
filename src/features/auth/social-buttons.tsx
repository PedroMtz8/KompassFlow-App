import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { authClient } from '@/lib/auth-client';

import { authErrorMessage } from './errors';

/**
 * Acceso con Google. En nativo abre el navegador del sistema y vuelve por deep link;
 * en web redirige. Requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor (ver .env.example).
 */
export function SocialButtons() {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const signInWithGoogle = async () => {
    setError(undefined);
    setPending(true);
    const { error: authError } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    setPending(false);
    if (authError) setError(authErrorMessage(authError, 'No se pudo iniciar sesión con Google.'));
  };

  return (
    <View className="gap-2.5">
      <Button variant="secondary" size="lg" loading={pending} onPress={signInWithGoogle}>
        <Text className="text-[15px] font-bold">Continuar con Google</Text>
      </Button>
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </View>
  );
}
