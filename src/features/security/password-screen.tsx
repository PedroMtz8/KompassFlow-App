import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { authClient } from '@/lib/auth-client';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import KeyRound from 'lucide-react-native/icons/key-round';

import { usePasswordMutation, useSecurity } from './queries';

/** Define o cambia la contraseña. Con ella se puede entrar con correo y contraseña (p. ej. en Expo Go, donde Google no regresa a la app). */
export function PasswordScreen() {
  const email = authClient.useSession().data?.user.email;
  const sec = useSecurity();
  const hasPassword = !!sec.data?.hasPassword;
  const mut = usePasswordMutation(hasPassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (sec.isPending) {
    return (
      <FormScreen title="Contraseña" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }

  const submit = () => {
    if (hasPassword && !current) return setError('Escribe tu contraseña actual.');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setError(null);
    mut.mutate(
      { current, next },
      {
        onSuccess: () => done(hasPassword ? 'Contraseña actualizada' : 'Contraseña definida', () => goBack()),
        onError: (e) => setError(e.message),
      }
    );
  };

  return (
    <FormScreen
      title={hasPassword ? 'Cambiar contraseña' : 'Definir contraseña'}
      subtitle={email}
      cta={mut.isPending ? 'Guardando…' : 'Guardar'}
      onSubmit={submit}
    >
      {!hasPassword ? (
        <InfoBanner
          icon={KeyRound}
          tone="violet"
          text={`Hoy entras con Google. Con una contraseña también podrás entrar con ${email ?? 'tu correo'} y esa contraseña.`}
        />
      ) : null}
      {hasPassword ? (
        <Field label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      ) : null}
      <Field
        label="Nueva contraseña"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Mínimo 8 caracteres"
      />
      <Field label="Repite la nueva contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}
