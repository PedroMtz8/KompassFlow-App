import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { appLink } from '@/lib/app-link';
import { authClient } from '@/lib/auth-client';
import { done } from '@/lib/simulate';
import { zodResolver } from '@/lib/zod-resolver';

import { authErrorMessage } from './errors';
import { signUpSchema, type SignUpValues } from './schemas';

export function SignUpForm() {
  const [serverError, setServerError] = useState<string>();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setServerError(undefined);
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: appLink('/') });
    if (error) return setServerError(authErrorMessage(error, 'No se pudo crear la cuenta.'));
    // `autoSignIn` está activo en el servidor: al registrarse ya hay sesión. Primer acceso: elegir intereses.
    done('Te enviamos un correo para confirmar tu cuenta');
    router.replace('/interests');
  });

  return (
    <View className="gap-3.5">
      <TextField control={control} name="name" label="Nombre" autoComplete="name" placeholder="Tu nombre" />
      <TextField
        control={control}
        name="email"
        label="Correo"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="tu@correo.com"
      />
      <TextField
        control={control}
        name="password"
        label="Contraseña"
        secureTextEntry
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
      />
      <TextField
        control={control}
        name="confirmPassword"
        label="Confirmar contraseña"
        secureTextEntry
        autoComplete="new-password"
        placeholder="Repite tu contraseña"
      />
      <Text variant="muted" className="text-center text-xs leading-[18px]">
        Al crear tu cuenta aceptas los{' '}
        <Text className="text-xs font-bold text-primary" onPress={() => router.push('/terms')}>
          Términos
        </Text>{' '}
        y el{' '}
        <Text className="text-xs font-bold text-primary" onPress={() => router.push('/privacy')}>
          Aviso de privacidad
        </Text>
        .
      </Text>
      {serverError ? <Text className="text-[13px] font-semibold text-destructive">{serverError}</Text> : null}
      <Button size="lg" onPress={onSubmit} loading={isSubmitting}>
        <Text className="text-[15.5px]">Crear cuenta</Text>
      </Button>
    </View>
  );
}
