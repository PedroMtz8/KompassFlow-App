import KeyRound from 'lucide-react-native/icons/key-round';
import TimerOff from 'lucide-react-native/icons/timer-off';
import { useState } from 'react';

import { FormScreen } from '@/components/form-screen';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useSecurity } from '@/features/security/queries';
import { authClient } from '@/lib/auth-client';
import { signOut } from '@/lib/sign-out';
import { done } from '@/lib/simulate';
import { useQueryClient } from '@tanstack/react-query';

import { useForcedPasswordChange } from './queries';

/**
 * Primer acceso con una contraseña temporal (cuenta creada por una academia). Mientras no se cambie, el servidor
 * rechaza todo lo demás; esta pantalla es lo único que se ve.
 */
export function ForcePasswordScreen() {
  const session = authClient.useSession().data?.user;
  const sec = useSecurity();
  const qc = useQueryClient();
  const mut = useForcedPasswordChange();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const doSignOut = () => signOut();

  if (sec.data?.credentialsExpired) {
    return (
      <FormScreen title="Credenciales caducadas" subtitle={session?.email} cta="Cerrar sesión" onSubmit={doSignOut} back={false}>
        <InfoBanner
          icon={TimerOff}
          tone="amber"
          text="La contraseña temporal caducó. Pide a tu academia que te genere una nueva y vuelve a entrar."
        />
      </FormScreen>
    );
  }

  const submit = () => {
    if (!current) return setError('Escribe la contraseña temporal que te dieron.');
    if (next.length < 8) return setError('Tu nueva contraseña debe tener al menos 8 caracteres.');
    if (next === current) return setError('La nueva contraseña debe ser distinta a la temporal.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setError(null);
    mut.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: async () => {
          done('Contraseña creada');
          // Al refrescar, el navegador raíz deja de bloquear y entra a la app.
          await qc.invalidateQueries({ queryKey: ['me', 'security'] });
        },
        onError: (e) => setError(e.message),
      }
    );
  };

  return (
    <FormScreen
      title="Crea tu contraseña"
      subtitle={session?.email}
      cta={mut.isPending ? 'Guardando…' : 'Guardar y entrar'}
      onSubmit={submit}
      secondary={{ label: 'Cerrar sesión', onPress: doSignOut }}
      back={false}
    >
      <InfoBanner
        icon={KeyRound}
        tone="violet"
        text="Tu academia creó esta cuenta con una contraseña temporal. Crea la tuya para que solo tú puedas entrar."
      />
      <Field label="Contraseña temporal" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Field label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" placeholder="Mínimo 8 caracteres" />
      <Field label="Repite la nueva contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}
