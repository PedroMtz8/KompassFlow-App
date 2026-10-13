import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useSecurity } from '@/features/security/queries';
import { api } from '@/lib/api';
import { signOut } from '@/lib/sign-out';
import { done } from '@/lib/simulate';

/** Eliminar la cuenta propia (exigido por las tiendas de apps y por la ley de datos personales). Es definitivo. */
export function DeleteAccountScreen() {
  const sec = useSecurity();
  const hasPassword = !!sec.data?.hasPassword;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);

  const submit = async () => {
    if (confirm.trim().toUpperCase() !== 'ELIMINAR') return setError('Escribe ELIMINAR para confirmar.');
    if (hasPassword && !password) return setError('Escribe tu contraseña para confirmar.');
    setError(null);
    setBusy(true);
    const { error: err } = await api.me.delete.post({ confirm, password: hasPassword ? password : undefined });
    setBusy(false);
    if (err) {
      const v = err.value as { message?: string; code?: string } | undefined;
      setReauth(v?.code === 'REAUTH_REQUIRED');
      return setError(v?.message ?? 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
    }
    await signOut().catch(() => {});
    done('Tu cuenta se eliminó', () => router.replace('/sign-in'));
  };

  return (
    <FormScreen
      title="Eliminar mi cuenta"
      subtitle="Esta acción es definitiva"
      cta={busy ? 'Eliminando…' : 'Eliminar mi cuenta'}
      ctaVariant="destructive"
      loading={busy}
      onSubmit={submit}
      secondary={reauth ? { label: 'Cerrar sesión', onPress: () => signOut().then(() => router.replace('/sign-in')) } : undefined}
    >
      <InfoBanner icon={Trash2} tone="pink" text="Se borrará tu cuenta, tus sesiones y tu acceso en todos tus dispositivos. No se puede deshacer." />
      <View className="gap-1.5 rounded-[20px] bg-card p-3.5">
        <Text className="text-[13.5px] font-extrabold">Qué pasa con tus datos</Text>
        <Text variant="muted" className="text-[13px] leading-5">
          • Se borran tu nombre, correo, foto, intereses y vínculos con academias.{'\n'}• Las academias conservan sus registros de pagos, asistencia y reservas,
          pero sin tu nombre, correo ni teléfono.{'\n'}• Si eres la única persona propietaria de una academia, primero tienes que traspasarla a otra persona del equipo o eliminarla.
        </Text>
      </View>
      {hasPassword ? (
        <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      ) : null}
      <Field label="Escribe ELIMINAR para confirmar" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" placeholder="ELIMINAR" />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}
