import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { FormScreen } from '@/components/form-screen';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useActiveOrganization } from '@/features/organizations/queries';
import { enterStudentMode } from '@/features/organizations/space';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

/** Eliminar la academia completa (solo su propietario). Se confirma escribiendo su nombre. */
export function DeleteAcademyScreen() {
  const { activeId, org } = useActiveOrganization();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!org || org.role !== 'owner') {
    return (
      <FormScreen title="Eliminar academia" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">Solo la persona propietaria puede eliminar la academia.</Text>
      </FormScreen>
    );
  }

  const submit = async () => {
    if (name.trim().toLowerCase() !== org.name.trim().toLowerCase()) return setError('Escribe el nombre exactamente como aparece.');
    setError(null);
    setBusy(true);
    const { error: err } = await api.orgs({ id: activeId! }).delete({ confirmName: name });
    setBusy(false);
    if (err) return setError((err.value as { message?: string } | undefined)?.message ?? 'No se pudo eliminar la academia.');
    await qc.invalidateQueries({ queryKey: ['orgs'] });
    await enterStudentMode();
    done(`«${org.name}» se eliminó`);
  };

  return (
    <FormScreen title="Eliminar academia" subtitle={org.name} cta={busy ? 'Eliminando…' : 'Eliminar academia'} ctaVariant="destructive" loading={busy} onSubmit={submit}>
      <InfoBanner
        icon={Trash2}
        tone="pink"
        text="Se borran para siempre las clases, los alumnos, los pagos, el equipo y las fotos de esta academia. Quien tenga reservas próximas recibirá un aviso por correo."
      />
      <Field label={`Escribe «${org.name}» para confirmar`} value={name} onChangeText={setName} autoCapitalize="none" />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}
