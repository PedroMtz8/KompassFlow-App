import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { can } from '@/features/organizations/permissions';
import { useActiveOrganization, useTeam } from '@/features/organizations/queries';
import { roleLabel } from '@/features/organizations/space';
import type { Tone } from '@/lib/tones';
import { authClient } from '@/lib/auth-client';

export const roleTone: Record<string, { tone: Tone; solid?: boolean }> = {
  owner: { tone: 'ink', solid: true },
  admin: { tone: 'violet' },
  instructor: { tone: 'orange' },
  staff: { tone: 'amber' },
};

type Filter = 'all' | 'instructor' | 'staff' | 'admin' | 'custom';
const SYSTEM_ROLES = ['owner', 'admin', 'instructor', 'staff'];

/** Equipo de la organización activa: miembros e invitaciones pendientes. */
export function TeamScreen() {
  const { activeId, org } = useActiveOrganization();
  const team = useTeam(activeId);
  const { data: session } = authClient.useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const terms = org?.terms;
  const canInvite = can(org, 'invitation', 'create');
  const canManage = can(org, 'member', 'update');

  const matches = (role: string | null) => filter === 'all' || (filter === 'custom' ? !SYSTEM_ROLES.includes(role ?? 'staff') : role === filter);
  const members = (team.data?.members ?? []).filter((m) => matches(m.role));
  const invitations = (team.data?.invitations ?? []).filter((i) => matches(i.role));
  const hasCustom = (team.data?.members ?? []).some((m) => !SYSTEM_ROLES.includes(m.role));
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'instructor', label: terms?.instructors ?? 'Instructores' },
    { id: 'staff', label: 'Staff' },
    { id: 'admin', label: 'Admin' },
    ...(hasCustom ? [{ id: 'custom' as const, label: 'Otros roles' }] : []),
  ];

  return (
    <Screen>
      <ScreenHeader
        title="Equipo"
        subtitle={`${team.data?.members.length ?? 0} ${team.data?.members.length === 1 ? 'miembro' : 'miembros'} · ${org?.name ?? ''}`}
      />
      <View className="mx-auto w-full max-w-[480px] md:max-w-[680px] flex-row flex-wrap gap-2 px-5 pb-2">
        {filters.map((f) => (
          <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />
        ))}
      </View>
      <ScreenScroll contentContainerClassName="gap-2.5">
        <QueryStatus q={team} />
        <View>
          {members.map((m, i) => {
            const isMe = m.userId === session?.user.id;
            return (
              <View key={m.id}>
                <Pressable
                  disabled={m.role === 'owner' && !isMe ? true : !(canManage || isMe)}
                  onPress={() => router.push({ pathname: '/member', params: { memberId: m.id } })}
                  className="flex-row items-center gap-[11px] py-[9px] active:opacity-80"
                >
                  <Avatar uri={m.image} name={m.name} size={40} />
                  <View className="min-w-0 flex-1 gap-[3px]">
                    <Text className="text-sm font-bold" numberOfLines={1}>
                      {m.name}
                      {isMe ? ' (tú)' : ''}
                    </Text>
                    {m.email ? (
                      <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                        {m.email}
                      </Text>
                    ) : m.extraPermissions ? (
                      <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                        Con permisos adicionales
                      </Text>
                    ) : null}
                  </View>
                  <Badge tone={roleTone[m.role]?.tone ?? 'ink'} appearance={roleTone[m.role]?.solid ? 'solid' : 'soft'}>
                    {roleLabel(m.role, terms?.instructor)}
                  </Badge>
                </Pressable>
                {i < members.length - 1 || invitations.length ? <ListDivider /> : null}
              </View>
            );
          })}
          {invitations.map((inv, i) => (
            <View key={inv.id}>
              <Pressable
                disabled={!canInvite}
                onPress={() => router.push({ pathname: '/member', params: { invitationId: inv.id } })}
                className="flex-row items-center gap-[11px] py-[9px] active:opacity-80"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#C9BFCD] bg-muted">
                  <Text className="text-[13px] font-extrabold text-muted-foreground">{inv.email[0]?.toUpperCase()}</Text>
                </View>
                <View className="min-w-0 flex-1 gap-[3px]">
                  <Text className="text-sm font-bold" numberOfLines={1}>
                    {inv.email}
                  </Text>
                  <Text className="text-[11.5px] text-muted-foreground">
                    Invitado como {roleLabel(inv.role ?? 'staff', terms?.instructor).toLowerCase()}
                  </Text>
                </View>
                <Badge tone="ink">PENDIENTE</Badge>
              </Pressable>
              {i < invitations.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
          {!team.isPending && !team.isError && members.length + invitations.length === 0 ? (
            <Text variant="muted">Nadie en esta categoría todavía.</Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => router.push('/roles' as never)}
          className="flex-row items-center gap-3 rounded-[22px] bg-teal-soft p-3.5 active:opacity-90"
        >
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-[13.5px] font-extrabold text-teal-ink">Roles y permisos</Text>
            <Text className="text-xs text-teal-dark">Mira qué puede hacer cada rol o crea uno a tu medida.</Text>
          </View>
          <Icon as={ChevronRight} size={18} />
        </Pressable>
      </ScreenScroll>
      {canInvite ? (
        <FooterBar>
          <Button size="lg" onPress={() => router.push('/invite-member')}>
            <Text className="text-[15.5px]">Invitar miembro</Text>
          </Button>
        </FooterBar>
      ) : null}
    </Screen>
  );
}
