import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';

import { AuthShell, OrDivider } from './auth-shell';
import { SignUpForm } from './sign-up-form';
import { SocialButtons } from './social-buttons';

export function SignUpScreen() {
  return (
    <AuthShell
      title={'Crea tu\ncuenta'}
      subtitle="Una sola cuenta para ser alumno, instructor o dueño de academia."
      footer={
        <Link href="/sign-in" asChild>
          <Pressable>
            <Text className="text-[13.5px] text-muted-foreground">
              ¿Ya tienes cuenta? <Text className="text-[13.5px] font-extrabold text-primary">Inicia sesión</Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
      <SignUpForm />
      <OrDivider />
      <SocialButtons />
    </AuthShell>
  );
}
