import { router, useLocalSearchParams } from 'expo-router';
import KeyRound from 'lucide-react-native/icons/key-round';
import MailCheck from 'lucide-react-native/icons/mail-check';
import { useState } from 'react';

import { FormScreen } from '@/components/form-screen';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { appLink } from '@/lib/app-link';
import { authClient } from '@/lib/auth-client';
import { done } from '@/lib/simulate';

import { authErrorMessage } from './errors';

/** Pedir el enlace para crear una contraseña nueva. Responde igual exista o no la cuenta (no revela qué correos están registrados). */
export function RecoverAccessScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = async () => {
    if (!valid) return setError('Escribe un correo válido.');
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: appLink('/reset-password') });
    setBusy(false);
    if (err) return setError(authErrorMessage(err, 'No pudimos enviar el correo. Inténtalo de nuevo.'));
    setSent(true);
  };

  if (sent) {
    return (
      <FormScreen
        title="Revisa tu correo"
        subtitle={email.trim()}
        cta="Volver a iniciar sesión"
        onSubmit={() => router.replace('/sign-in')}
        secondary={{ label: 'Usar otro correo', onPress: () => setSent(false) }}
      >
        <InfoBanner
          icon={MailCheck}
          tone="teal"
          text="Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Sirve 1 hora. Revisa también la carpeta de spam."
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Recuperar acceso"
      subtitle="Te enviamos un enlace para crear una contraseña nueva"
      cta={busy ? 'Enviando…' : 'Enviar enlace'}
      loading={busy}
      onSubmit={submit}
    >
      <Field
        label="Correo de tu cuenta"
        value={email}
        onChangeText={setEmail}
        placeholder="tu@correo.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        maxLength={160}
      />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}

/** Crear la contraseña nueva con el token que llega en el enlace del correo. */
export function ResetPasswordScreen() {
  const { token, error: linkError } = useLocalSearchParams<{ token?: string; error?: string }>();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || linkError) {
    return (
      <FormScreen title="Enlace no válido" cta="Pedir un enlace nuevo" onSubmit={() => router.replace('/recover-access')} back={false}>
        <InfoBanner icon={KeyRound} tone="amber" text="Este enlace venció o ya se usó. Pide uno nuevo para crear tu contraseña." />
      </FormScreen>
    );
  }

  const submit = async () => {
    if (next.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.resetPassword({ newPassword: next, token });
    setBusy(false);
    if (err) return setError(authErrorMessage(err, 'El enlace venció o ya se usó. Pide uno nuevo.'));
    done('Contraseña actualizada. Ya puedes entrar.', () => router.replace('/sign-in'));
  };

  return (
    <FormScreen title="Crea tu contraseña nueva" cta={busy ? 'Guardando…' : 'Guardar contraseña'} loading={busy} onSubmit={submit} back={false}>
      <Field label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" placeholder="Mínimo 8 caracteres" />
      <Field label="Repite la contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}
