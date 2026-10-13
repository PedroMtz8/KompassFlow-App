import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useActiveOrganization } from '@/features/organizations/queries';
import { useRoles, type RoleItem } from '@/features/roles/queries';

type Catalog = NonNullable<ReturnType<typeof useRoles>['data']>['catalog'];

/** Resumen legible de lo que permite un rol: «Alumnos: Ver, Editar · Pagos: Crear…». */
function Summary({ role, catalog }: { role: RoleItem; catalog: Catalog }) {
  const rows = catalog
    .map((c) => ({
      label: c.label,
      actions: c.actions.filter((a) => role.permissions[c.resource]?.includes(a.id)).map((a) => a.label),
    }))
    .filter((r) => r.actions.length);
  if (!rows.length) return <Text variant="muted" className="text-xs">Sin permisos.</Text>;
  return (
    <View className="gap-1.5">
      {rows.map((r) => (
        <View key={r.label} className="flex-row gap-2">
          <Text className="w-[130px] text-xs font-bold">{r.label}</Text>
          <Text variant="muted" className="flex-1 text-xs">
            {r.actions.join(', ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function usageText(r: RoleItem) {
  const parts = [`${r.members} ${r.members === 1 ? 'persona' : 'personas'}`];
  if (r.invitations) parts.push(`${r.invitations} ${r.invitations === 1 ? 'invitación' : 'invitaciones'}`);
  return parts.join(' · ');
}

/** Roles y permisos: los del sistema (fijos) y los que la academia crea a su medida. */
export function RolesScreen() {
  const { activeId, org } = useActiveOrganization();
  const q = useRoles(activeId);
  const [open, setOpen] = useState<string | null>(null);
  const data = q.data;
  const system = data?.roles.filter((r) => r.system) ?? [];
  const custom = data?.roles.filter((r) => !r.system) ?? [];
  const terms = org?.terms;

  return (
    <Screen>
      <ScreenHeader title="Roles y permisos" subtitle={org?.name} />
      <ScreenScroll contentContainerClassName="gap-3 pb-6">
        <QueryStatus q={q} what="los roles" />
        {data ? (
          <>
            <SectionHeader title="Roles del sistema" />
            <Text variant="muted" className="-mt-1.5 text-xs">
              Vienen con la plataforma y no se pueden modificar. Si necesitas algo distinto, crea un rol propio.
            </Text>
            {system.map((r) => {
              const expanded = open === r.id;
              const label = r.id === 'instructor' ? (terms?.instructor ?? r.label) : r.label;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setOpen(expanded ? null : r.id)}
                  className="gap-2.5 rounded-[22px] bg-card px-4 py-3.5 active:opacity-90"
                >
                  <View className="flex-row items-center gap-2.5">
                    <Icon as={ShieldCheck} size={18} />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[15px] font-extrabold">{label}</Text>
                        <Badge tone="ink">SISTEMA</Badge>
                      </View>
                      <Text variant="muted" className="text-xs">
                        {r.description} · {usageText(r)}
                      </Text>
                    </View>
                    <Icon as={expanded ? ChevronDown : ChevronRight} size={17} />
                  </View>
                  {expanded ? <Summary role={r} catalog={data.catalog} /> : null}
                </Pressable>
              );
            })}

            <SectionHeader title="Roles personalizados" />
            <Text variant="muted" className="-mt-1.5 text-xs">
              Crea roles con los permisos exactos que necesitas ({custom.length} de {data.maxCustom}).
            </Text>
            {custom.length === 0 ? <Text variant="muted">Aún no has creado ninguno.</Text> : null}
            {custom.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => (data.canManage ? router.push({ pathname: '/role-editor', params: { role: r.id } } as never) : setOpen(open === r.id ? null : r.id))}
                className="gap-2.5 rounded-[22px] bg-card px-4 py-3.5 active:opacity-90"
              >
                <View className="flex-row items-center gap-2.5">
                  <Icon as={ShieldCheck} size={18} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-[15px] font-extrabold">{r.label}</Text>
                    <Text variant="muted" className="text-xs">
                      {usageText(r)}
                    </Text>
                  </View>
                  <Icon as={ChevronRight} size={17} />
                </View>
                {open === r.id && !data.canManage ? <Summary role={r} catalog={data.catalog} /> : null}
              </Pressable>
            ))}
          </>
        ) : null}
      </ScreenScroll>
      {data?.canManage && custom.length < data.maxCustom ? (
        <FooterBar>
          <Button size="lg" onPress={() => router.push('/role-editor' as never)}>
            <Text className="text-[15.5px]">Nuevo rol</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}
