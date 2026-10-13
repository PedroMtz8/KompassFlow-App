import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { authClient } from '@/lib/auth-client';
import { zodResolver } from '@/lib/zod-resolver';

import { authErrorMessage } from './errors';
import { signInSchema, type SignInValues } from './schemas';

export function SignInForm() {
  const [serverError, setServerError] = useState<string>();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    const { error } = await authClient.signIn.email(values);
    if (error) return setServerError(authErrorMessage(error, 'No se pudo iniciar sesión.'));
    router.replace('/');
  });

  return (
    <View className="gap-3.5">
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
        autoComplete="current-password"
        placeholder="Tu contraseña"
      />
      <Pressable onPress={() => router.push('/recover-access')} className="-mt-1 self-end py-1 active:opacity-70">
        <Text className="text-[13px] font-bold text-primary">¿Olvidaste tu contraseña?</Text>
      </Pressable>
      {serverError ? <Text className="text-[13px] font-semibold text-destructive">{serverError}</Text> : null}
      <Button size="lg" onPress={onSubmit} loading={isSubmitting}>
        <Text className="text-[15.5px]">Iniciar sesión</Text>
      </Button>
    </View>
  );
}
