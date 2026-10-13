import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';

import { AuthShell, OrDivider } from './auth-shell';
import { SignInForm } from './sign-in-form';
import { SocialButtons } from './social-buttons';

export function SignInScreen() {
  return (
    <AuthShell
      title={'Bienvenido\nde vuelta'}
      subtitle="Entra para reservar tus clases o administrar tu academia."
      footer={
        <Link href="/sign-up" asChild>
          <Pressable>
            <Text className="text-[13.5px] text-muted-foreground">
              ¿Nuevo en KompasFlow? <Text className="text-[13.5px] font-extrabold text-primary">Crea tu cuenta</Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
      <SignInForm />
      <OrDivider />
      <SocialButtons />
    </AuthShell>
  );
}
