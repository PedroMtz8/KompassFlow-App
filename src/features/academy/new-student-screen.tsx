import { router } from 'expo-router';
import { KeyRound, Link2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useAccountMutations } from '@/features/accounts/queries';

import { FormGroup, FormScreen } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { useStudentMutations } from '@/features/bookings/queries';
import { useActiveOrganization } from '@/features/organizations/queries';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

const levels = [
  { id: 'NEW', label: 'Nuevo' },
  { id: 'BEGINNER', label: 'Básico' },
  { id: 'INTERMEDIATE', label: 'Intermedio' },
  { id: 'ADVANCED', label: 'Avanzado' },
] as const;

/** Alta en recepción: un alumno puede existir sin cuenta y vincularse después sin perder su historial. */
export function NewStudentScreen() {
  const { activeId, org } = useActiveOrganization();
  const mut = useStudentMutations(activeId ?? '');
  const accounts = useAccountMutations(activeId ?? '', org?.name);
  const [withAccount, setWithAccount] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', email: '', level: 'NEW' as (typeof levels)[number]['id'] });
  const emailOk = !f.email.trim() || /^\S+@\S+\.\S+$/.test(f.email.trim());
  const valid = f.name.trim().length >= 2 && emailOk && (!withAccount || !!f.email.trim());

  return (
    <FormScreen
      title="Nuevo alumno"
      subtitle={org?.name}
      cta={mut.create.isPending || accounts.create.isPending ? 'Guardando…' : withAccount ? 'Guardar y crear cuenta' : 'Guardar alumno'}
      onSubmit={() => {
        if (!valid)
          return done(
            !emailOk ? 'El correo no es válido.' : withAccount && !f.email.trim() ? 'Para crear la cuenta hace falta su correo.' : 'Escribe el nombre del alumno.'
          );
        mut.create.mutate(
          { name: f.name, phone: f.phone || undefined, email: f.email.trim() || undefined, level: f.level },
          {
            onSuccess: () => {
              if (!withAccount) return done('Alumno guardado', goBack);
              // El alumno ya existe: la cuenta se crea con el mismo correo y se une a ese registro (conserva teléfono y nivel).
              accounts.create.mutate(
                { kind: 'student', name: f.name.trim(), email: f.email.trim() },
                {
                  onSuccess: () => router.replace('/account-created' as never),
                  onError: (e) => done(`Alumno guardado, pero no se creó la cuenta: ${e.message}`, goBack),
                }
              );
            },
            onError: (e) => done(e.message),
          }
        );
      }}
      secondary={{ label: 'Cancelar', onPress: () => router.back() }}
    >
      <InfoBanner
        icon={Link2}
        tone="violet"
        text="No necesita cuenta. Si después instala KompasFlow, vinculas su historial con su teléfono o correo."
      />
      <Field label="Nombre completo" value={f.name} onChangeText={(name) => setF({ ...f, name })} maxLength={100} />
      <Field
        label="WhatsApp / teléfono"
        value={f.phone}
        onChangeText={(phone) => setF({ ...f, phone })}
        keyboardType="phone-pad"
        maxLength={32}
      />
      <Field
        label="Correo (opcional)"
        value={f.email}
        onChangeText={(email) => setF({ ...f, email })}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={160}
      />
      <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
        <Icon as={KeyRound} size={18} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-bold">Crear cuenta de acceso</Text>
          <Text variant="muted" className="text-xs">
            Entra con su correo y una contraseña temporal que tú le compartes.
          </Text>
        </View>
        <Toggle value={withAccount} onValueChange={setWithAccount} />
      </View>
      <FormGroup label="Nivel">
        <View className="flex-row flex-wrap gap-2">
          {levels.map((l) => (
            <Chip key={l.id} label={l.label} selected={f.level === l.id} onPress={() => setF({ ...f, level: l.id })} />
          ))}
        </View>
      </FormGroup>
    </FormScreen>
  );
}
