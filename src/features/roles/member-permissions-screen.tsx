import { useLocalSearchParams } from 'expo-router';
import { Info, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { FormScreen } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useActiveOrganization, useTeam } from '@/features/organizations/queries';
import { useMemberExtras, useRoles, type Permissions } from '@/features/roles/queries';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

/**
 * Permisos adicionales de una persona sobre su rol. Lo que el rol ya da aparece marcado y fijo; el resto se puede sumar.
 * Se guarda solo para esa persona o, si se prefiere, como un rol nuevo reutilizable (copia del rol + lo adicional).
 */
export function MemberPermissionsScreen() {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const team = useTeam(activeId);
  const roles = useRoles(activeId);
  const mut = useMemberExtras(activeId ?? '');
  const member = team.data?.members.find((m) => m.id === memberId);
  const base = roles.data?.roles.find((r) => r.id === member?.role);
  const [picked, setPicked] = useState<Permissions | null>(null);
  const [asTemplate, setAsTemplate] = useState(false);
  const [name, setName] = useState<string | null>(null);

  if (team.isPending || roles.isPending || !member || !base) {
    return (
      <FormScreen title="Permisos adicionales" cta="Guardar" onSubmit={() => {}}>
        <QueryStatus q={team.isPending ? team : roles} what="los datos" />
        {!team.isPending && !roles.isPending && (!member || !base) ? <Text variant="muted">No encontramos a esa persona.</Text> : null}
      </FormScreen>
    );
  }

  const baseLabel = member.role === 'instructor' ? (org?.terms.instructor ?? base.label) : base.label;
  const extra: Permissions = picked ?? (member.extraPermissions as Permissions | null) ?? {};
  const mine = org?.permissions ?? {};
  const isOwner = org?.role === 'owner';
  const count = Object.values(extra).reduce((n, a) => n + a.length, 0);
  const templateName = name ?? `${baseLabel} + permisos adicionales`;
  const firstName = member.name.split(' ')[0];
  const hadExtras = !!member.extraPermissions;

  const toggle = (resource: string, action: string) =>
    setPicked((prev) => {
      const cur = prev ?? (member.extraPermissions as Permissions | null) ?? {};
      const list = cur[resource] ?? [];
      const next = list.includes(action) ? list.filter((a) => a !== action) : [...list, action];
      const out = { ...cur, [resource]: next };
      if (!next.length) delete out[resource];
      return out;
    });

  const submit = () => {
    if (asTemplate) {
      if (!count) return done('Elige al menos un permiso adicional.');
      if (templateName.trim().length < 3) return done('Escribe un nombre de al menos 3 letras.');
    }
    mut.mutate(
      { memberId: member.id, permissions: extra, template: asTemplate ? { name: templateName.trim() } : undefined },
      {
        onSuccess: (r) =>
          done(r?.template ? `Rol «${templateName.trim()}» creado y asignado a ${firstName}` : count ? 'Permisos adicionales guardados' : 'Sin permisos adicionales', goBack),
        onError: (e) => done(e.message),
      }
    );
  };

  return (
    <FormScreen
      title="Permisos adicionales"
      subtitle={`${member.name} · ${baseLabel}`}
      cta={mut.isPending ? 'Guardando…' : asTemplate ? 'Crear rol y asignar' : 'Guardar'}
      loading={mut.isPending}
      onSubmit={submit}
      secondary={
        hadExtras && !asTemplate
          ? {
              label: 'Quitar permisos adicionales',
              onPress: () =>
                mut.mutate(
                  { memberId: member.id, permissions: {} },
                  { onSuccess: () => done('Permisos adicionales quitados', goBack), onError: (e) => done(e.message) }
                ),
            }
          : undefined
      }
    >
      <InfoBanner
        icon={Info}
        tone="violet"
        text={`${firstName} conserva su rol de ${baseLabel.toLowerCase()} (lo marcado y fijo abajo) y suma lo que elijas aquí.`}
      />
      {roles.data?.catalog.map((c) => (
        <View key={c.resource} className="gap-2 rounded-[20px] bg-card p-3.5">
          <Text className="text-[13.5px] font-extrabold">{c.label}</Text>
          <View className="flex-row flex-wrap gap-2">
            {c.actions.map((a) => {
              const fromRole = !!base.permissions[c.resource]?.includes(a.id);
              return (
                <Chip
                  key={a.id}
                  label={a.label}
                  onCard
                  selected={fromRole || !!extra[c.resource]?.includes(a.id)}
                  disabled={fromRole || (!isOwner && !mine[c.resource]?.includes(a.id))}
                  onPress={() => toggle(c.resource, a.id)}
                />
              );
            })}
          </View>
        </View>
      ))}
      <Text variant="muted" className="text-xs">
        {count} {count === 1 ? 'permiso adicional' : 'permisos adicionales'}.
      </Text>

      {roles.data?.canManage ? (
        <View className="gap-3 rounded-[20px] bg-card p-3.5">
          <View className="flex-row items-center gap-3">
            <Icon as={Sparkles} size={18} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-sm font-bold">Guardar como rol reutilizable</Text>
              <Text variant="muted" className="text-xs">
                {asTemplate
                  ? `Se creará un rol nuevo con lo de ${baseLabel.toLowerCase()} más lo adicional, y se le asignará a ${firstName}. Podrás darlo a más personas.`
                  : `Si lo dejas apagado, estos permisos son solo para ${firstName} y su rol sigue siendo ${baseLabel.toLowerCase()}.`}
              </Text>
            </View>
            <Toggle value={asTemplate} onValueChange={setAsTemplate} />
          </View>
          {asTemplate ? <Field label="Nombre del rol" value={templateName} onChangeText={setName} maxLength={40} /> : null}
        </View>
      ) : null}
    </FormScreen>
  );
}
