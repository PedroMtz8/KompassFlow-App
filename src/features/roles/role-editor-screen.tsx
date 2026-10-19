import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useActiveOrganization } from '@/features/organizations/queries';
import { useRoleMutations, useRoles, type Permissions } from '@/features/roles/queries';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import Info from 'lucide-react-native/icons/info';

/** Crear o editar (con `role`) un rol personalizado: nombre y, por recurso, qué acciones permite. */
export function RoleEditorScreen() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const { activeId, org } = useActiveOrganization();
  const q = useRoles(activeId);
  const mut = useRoleMutations(activeId ?? '');
  const existing = role ? q.data?.roles.find((r) => r.id === role && !r.system) : undefined;
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Permissions | null>(null);
  const perms: Permissions = picked ?? existing?.permissions ?? {};
  const mine = org?.permissions ?? {};
  const isOwner = org?.role === 'owner';
  const editing = !!existing;

  if (role && q.isPending) {
    return (
      <FormScreen title="Rol" cta="Guardar" onSubmit={() => {}}>
        <Text variant="muted">Cargando…</Text>
      </FormScreen>
    );
  }
  if (role && !existing) {
    return (
      <FormScreen title="Rol" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No encontramos ese rol.</Text>
      </FormScreen>
    );
  }

  // Cambio funcional: dos toques seguidos no se pisan entre sí.
  const toggle = (resource: string, action: string) =>
    setPicked((prev) => {
      const base = prev ?? existing?.permissions ?? {};
      const cur = base[resource] ?? [];
      const next = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action];
      const out = { ...base, [resource]: next };
      if (!next.length) delete out[resource];
      return out;
    });
  const total = Object.values(perms).reduce((n, a) => n + a.length, 0);
  const pending = mut.create.isPending || mut.update.isPending;

  const submit = () => {
    if (!editing && name.trim().length < 3) return done('Escribe un nombre de al menos 3 letras.');
    if (!total) return done('Elige al menos un permiso.');
    const opts = {
      onSuccess: () => done(editing ? 'Rol actualizado' : 'Rol creado', goBack),
      onError: (e: Error) => done(e.message),
    };
    if (editing) mut.update.mutate({ role: existing!.id, permissions: perms }, opts);
    else mut.create.mutate({ name: name.trim(), permissions: perms }, opts);
  };

  return (
    <FormScreen
      title={editing ? existing!.label : 'Nuevo rol'}
      subtitle={org?.name}
      cta={pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear rol'}
      loading={pending}
      onSubmit={submit}
      secondary={
        editing
          ? {
              label: 'Eliminar rol',
              onPress: () =>
                mut.remove.mutate(existing!.id, { onSuccess: () => done('Rol eliminado', goBack), onError: (e) => done(e.message) }),
            }
          : undefined
      }
    >
      {!editing ? (
        <Field label="Nombre del rol" value={name} onChangeText={setName} placeholder="Ej: Coordinador, Cajero, Maestro invitado…" maxLength={40} />
      ) : (
        <Text variant="muted" className="text-xs">
          {existing!.members} {existing!.members === 1 ? 'persona tiene' : 'personas tienen'} este rol. Los cambios aplican al momento.
        </Text>
      )}
      <InfoBanner
        icon={Info}
        tone="violet"
        text={
          isOwner
            ? 'Elige qué puede hacer este rol en cada parte de la academia.'
            : 'Solo puedes dar permisos que tú también tienes; los demás aparecen atenuados.'
        }
      />
      {q.data?.catalog.map((c) => (
        <View key={c.resource} className="gap-2 rounded-[20px] bg-card p-3.5">
          <Text className="text-[13.5px] font-extrabold">{c.label}</Text>
          <View className="flex-row flex-wrap gap-2">
            {c.actions.map((a) => (
              <Chip
                key={a.id}
                label={a.label}
                selected={perms[c.resource]?.includes(a.id)}
                onCard
                disabled={!isOwner && !mine[c.resource]?.includes(a.id)}
                onPress={() => toggle(c.resource, a.id)}
              />
            ))}
          </View>
        </View>
      ))}
      <Text variant="muted" className="text-xs">
        {total} {total === 1 ? 'permiso elegido' : 'permisos elegidos'}.
      </Text>
    </FormScreen>
  );
}
