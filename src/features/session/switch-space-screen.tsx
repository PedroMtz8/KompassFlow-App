import { router } from 'expo-router';
import MailWarning from 'lucide-react-native/icons/mail-warning';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { DashedButton } from '@/components/ui/dashed-button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { IconButton } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { SpaceRow } from '@/components/ui/space-row';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useIsPlatformAdmin } from '@/features/admin/queries';
import { useResendVerification } from '@/features/auth/verification';
import { done } from '@/lib/simulate';
import { enterAdmin, enterOrganization, enterStudentMode, roleLabel } from '@/features/organizations/space';
import { useMyInvitations, useMyOrganizations, useRespondInvitation, type MyOrganization } from '@/features/organizations/queries';
import { authClient } from '@/lib/auth-client';
import type { Tone } from '@/lib/tones';
import { useSpace } from '@/stores/space';

const palette: Tone[] = ['orange', 'violet', 'teal', 'amber', 'pink', 'blue'];
// Tarjetas con texto blanco encima: sin ámbar (amarillo), que no contrasta.
const cardPalette: Tone[] = ['orange', 'violet', 'teal', 'pink', 'blue'];

const seed = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
/** Tono estable por organización (mismo id => mismo color en toda la app). */
export const toneFor = (id: string): Tone => palette[seed(id) % palette.length];
/** Como `toneFor`, pero apto para tarjetas con texto blanco. */
export const cardToneFor = (id: string): Tone => cardPalette[seed(id) % cardPalette.length];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Una cuenta, varios roles y organizaciones. Agrupa por lo que el usuario hace en cada una. */
export function SwitchSpaceScreen() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const activeOrgId = (session?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null;
  const mode = useSpace((s) => s.mode);
  const orgs = useMyOrganizations();
  const invitations = useMyInvitations();
  const respond = useRespondInvitation();
  const resend = useResendVerification();
  const isAdmin = !!useIsPlatformAdmin().data;
  const [needsVerify, setNeedsVerify] = useState(false);

  const list = orgs.data ?? [];
  const business = list.filter((o) => o.role === 'owner' || o.role === 'admin');
  // Cualquier otro rol (instructor, staff o un rol personalizado de la academia) va en «Donde trabajas».
  const works = list.filter((o) => o.role !== 'owner' && o.role !== 'admin');

  const row = (o: MyOrganization) => (
    <SpaceRow
      key={o.id}
      name={o.name}
      photo={o.logo ?? o.coverImage ?? undefined}
      initials={(o.logo ?? o.coverImage) ? undefined : initialsOf(o.name)}
      badge={roleLabel(o.role, o.terms.instructor)}
      badgeTone={o.role === 'owner' ? 'ink' : toneFor(o.id)}
      badgeSolid={o.role === 'owner'}
      detail={`${o.type === 'PERSONAL' ? 'Personal' : 'Estudio'} · ${o.verticalName}`}
      active={mode === 'org' && activeOrgId === o.id}
      onPress={() => enterOrganization(o.id)}
    />
  );

  return (
    <Screen bottomInset>
      <View className="mx-auto w-full max-w-[480px] md:max-w-[680px] flex-row items-center gap-3 px-5 pb-4 pt-1">
        <Avatar uri={user?.image} name={user?.name} size={54} radius={18} />
        <View className="flex-1 gap-[3px]">
          <Text variant="h3">{user?.name}</Text>
          <Text variant="muted">{user?.email}</Text>
        </View>
        <IconButton onPress={() => router.back()}>
          <Icon as={X} size={19} />
        </IconButton>
      </View>

      <ScreenScroll contentContainerClassName="gap-2.5">
        {invitations.data?.map((inv) => (
          <View key={inv.id} className="gap-2.5 rounded-[22px] bg-violet-soft p-3.5">
            <Text className="text-[13.5px] font-bold text-violet-ink">
              {inv.inviterName} te invitó a {inv.organizationName} como {roleLabel(inv.role ?? 'staff').toLowerCase()}.
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                className="flex-1"
                loading={respond.isPending}
                onPress={() =>
                  respond.mutate(
                    { id: inv.id, accept: true },
                    { onSuccess: () => done(`Ya eres parte de ${inv.organizationName}`),
                      onError: (e) => {
                        setNeedsVerify(/Verifica tu correo/i.test(e.message));
                        done(e.message);
                      },
                    }
                  )
                }
              >
                <Text className="text-[13px]">Aceptar</Text>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onPress={() => respond.mutate({ id: inv.id, accept: false }, { onSuccess: () => done('Invitación rechazada') })}
              >
                <Text className="text-[13px]">Rechazar</Text>
              </Button>
            </View>
          </View>
        ))}
        {needsVerify && user?.email ? (
          <InfoBanner
            icon={MailWarning}
            tone="amber"
            text="Para aceptar la invitación primero confirma tu correo. Te mandamos un enlace al registrarte."
            action={resend.isPending ? 'Enviando…' : 'Reenviar correo'}
            onAction={() => resend.mutate(user.email, { onSuccess: () => done('Te enviamos el correo de confirmación'), onError: (e) => done(e.message) })}
          />
        ) : null}
        <QueryStatus q={orgs} />

        {business.length ? <SectionHeader title="Tus negocios" /> : null}
        {business.map(row)}

        {works.length ? <SectionHeader title="Donde trabajas" className="pt-1.5" /> : null}
        {works.map(row)}

        {isAdmin ? (
          <>
            <SectionHeader title="Plataforma" className="pt-1.5" />
            <SpaceRow
              name="Administración de KompassFlow"
              icon={ShieldCheck}
              badge="ADMIN"
              badgeTone="ink"
              detail="Academias, planes, comisiones e ingresos"
              active={mode === 'admin'}
              onPress={enterAdmin}
            />
          </>
        ) : null}

        <SectionHeader title="Como alumno" className="pt-1.5" />
        <SpaceRow
          name="Descubrir y reservar"
          icon={Search}
          badge="ALUMNO"
          badgeTone="ink"
          detail="Clases, reservas y pagos"
          active={mode === 'student'}
          onPress={enterStudentMode}
        />
      </ScreenScroll>

      <FooterBar>
        <DashedButton
          label="Crear academia o negocio"
          icon={Plus}
          className="h-[52px] rounded-[17px]"
          onPress={() => router.push('/create-org')}
        />
      </FooterBar>
    </Screen>
  );
}
