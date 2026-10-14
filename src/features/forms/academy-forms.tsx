import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, KeyRound, Mail, ShieldCheck, ShieldUser, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { ConfirmModal } from '@/components/confirm-modal';
import { FormGroup, FormScreen } from '@/components/form-screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useAccountMutations } from '@/features/accounts/queries';
import { useCatalog } from '@/features/interests/queries';
import { useSecurity } from '@/features/security/queries';
import { useRoles } from '@/features/roles/queries';
import { QueryStatus } from '@/components/query-status';
import { CoverPicker, LogoPicker } from '@/features/organizations/cover-picker';
import { TimeZoneField } from '@/features/organizations/timezone-field';
import { suggestedZone } from '@/lib/timezone';
import {
  useActiveOrganization,
  useCreateOrganization,
  useLocationUpdate,
  useOrganization,
  useRemovalPreview,
  useTransferOwnership,
  useRoomMutations,
  useTeam,
  useTeamMutations,
  useUpdateOrganization,
  type AssignableRole,
} from '@/features/organizations/queries';
import { can } from '@/features/organizations/permissions';
import { enterOrganization, roleLabel } from '@/features/organizations/space';
import { useProductMutations, useProducts } from '@/features/payments/queries';
import { roleTone } from '@/features/academy/team-screen';
import { authClient } from '@/lib/auth-client';
import { done } from '@/lib/simulate';
import {
  emptyLocation,
  isLocationValid,
  LocationFields,
  toLocationBody,
  type LocationValue,
} from '@/features/organizations/location-fields';
import { useOrgDraft } from '@/stores/org-draft';
import { cn } from '@/lib/utils';
import { goBack } from '@/lib/nav';

/** Perfil público de la organización. Paso 2 de 3 del alta, o edición desde "Más". */
export function EditAcademyScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  return onboarding === '1' ? <EditOnboarding /> : <EditExisting />;
}

function ProfileFields({
  value,
  onChange,
  orgId,
  coverUrl,
  logoUrl,
  name,
}: {
  orgId?: string;
  coverUrl?: string | null;
  logoUrl?: string | null;
  name?: string;
  value: { description: string; phone: string; instagram: string; website: string };
  onChange: (p: Partial<{ description: string; phone: string; instagram: string; website: string }>) => void;
}) {
  return (
    <>
      <LogoPicker orgId={orgId} logoUrl={logoUrl} name={name} />
      <CoverPicker orgId={orgId} coverUrl={coverUrl} />
      <Field
        label="Descripción"
        multiline
        numberOfLines={3}
        value={value.description}
        onChangeText={(description) => onChange({ description })}
        maxLength={600}
        className="h-24 py-3 text-top"
      />
      <Field
        label="Teléfono / WhatsApp"
        value={value.phone}
        onChangeText={(phone) => onChange({ phone })}
        keyboardType="phone-pad"
        maxLength={32}
      />
      <Field
        label="Instagram"
        value={value.instagram}
        onChangeText={(instagram) => onChange({ instagram })}
        autoCapitalize="none"
        maxLength={64}
      />
      <Field
        label="Sitio web (opcional)"
        value={value.website}
        onChangeText={(website) => onChange({ website })}
        autoCapitalize="none"
        maxLength={120}
      />
    </>
  );
}

function EditOnboarding() {
  const { draft, patch } = useOrgDraft();
  return (
    <FormScreen title="Perfil público" subtitle="Paso 2 de 3" cta="Continuar" onSubmit={() => router.push('/add-location')}>
      <ProfileFields value={draft} onChange={patch} />
    </FormScreen>
  );
}

function EditExisting() {
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const update = useUpdateOrganization(activeId ?? '');
  const [form, setForm] = useState<{
    name: string;
    description: string;
    phone: string;
    instagram: string;
    website: string;
    isPublished: boolean;
    cancelWindowHours: string;
    timezone: string;
  } | null>(null);

  if (!activeId || detail.isPending) {
    return (
      <FormScreen title="Editar" subtitle={org?.name} cta="Guardar cambios" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (detail.isError) {
    return (
      <FormScreen title="Editar" cta="Reintentar" onSubmit={() => detail.refetch()}>
        <Text variant="muted">No pudimos cargar tu organización.</Text>
      </FormScreen>
    );
  }
  const d = detail.data;
  const value = form ?? {
    name: d.name,
    description: d.description ?? '',
    phone: d.phone ?? '',
    instagram: d.instagram ?? '',
    website: d.website ?? '',
    isPublished: d.isPublished,
    cancelWindowHours: String(d.cancelWindowHours),
    timezone: d.timezone,
  };
  const can = org?.role === 'owner' || org?.role === 'admin';

  return (
    <FormScreen
      title={`Editar ${d.type === 'PERSONAL' ? 'perfil' : 'negocio'}`}
      subtitle={d.name}
      cta={update.isPending ? 'Guardando…' : can ? 'Guardar cambios' : 'Solo lectura'}
      loading={update.isPending}
      onSubmit={() => {
        if (!can) return;
        const hours = parseInt(value.cancelWindowHours, 10);
        update.mutate(
          // Solo se envía la zona si cambió (el servidor rechaza cambiarla con clases próximas).
          {
            ...value,
            timezone: value.timezone === d.timezone ? undefined : value.timezone,
            cancelWindowHours: Number.isNaN(hours) ? undefined : hours,
          },
          {
            onSuccess: () => done('Cambios guardados', goBack),
            onError: (e) => done(e.message),
          }
        );
      }}
    >
      <Field label="Nombre" value={value.name} onChangeText={(name) => setForm({ ...value, name })} maxLength={80} />
      <ProfileFields
        value={value}
        onChange={(p) => setForm({ ...value, ...p })}
        orgId={activeId}
        coverUrl={d.coverImage}
        logoUrl={d.logo}
        name={value.name}
      />
      {d.verificationStatus === 'APPROVED' ? (
        <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-[13.5px] font-bold">Visible en Descubrir</Text>
            <Text className="text-[11.5px] text-muted-foreground">Negocio verificado · las personas pueden ver y reservar tus clases</Text>
          </View>
          <Toggle value={value.isPublished} onValueChange={(isPublished) => can && setForm({ ...value, isPublished })} />
        </View>
      ) : (
        <Pressable onPress={() => router.push('/verification' as never)} className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 active:opacity-80">
          <View className="flex-1 gap-0.5">
            <Text className="text-[13.5px] font-bold">Publicar en Descubrir</Text>
            <Text className="text-[11.5px] text-muted-foreground">
              {d.verificationStatus === 'PENDING'
                ? 'En revisión: te avisaremos cuando verifiquemos tu negocio'
                : d.verificationStatus === 'REJECTED'
                  ? 'No pudimos verificarte · toca para ver el motivo'
                  : 'Oculto · completa tu perfil y pide la verificación'}
            </Text>
          </View>
          <Badge tone={d.verificationStatus === 'PENDING' ? 'violet' : d.verificationStatus === 'REJECTED' ? 'amber' : 'ink'}>
            {d.verificationStatus === 'PENDING' ? 'EN REVISIÓN' : d.verificationStatus === 'REJECTED' ? 'RECHAZADA' : 'OCULTA'}
          </Badge>
          <Icon as={ChevronRight} size={16} />
        </Pressable>
      )}
      <TimeZoneField
        value={value.timezone}
        onChange={(timezone) => setForm({ ...value, timezone })}
        disabled={!can}
        note="Si ya tienes clases próximas programadas no se puede cambiar: sus horas se moverían. Cancélalas o reprográmalas primero."
      />
      <Field
        label="Plazo para cancelar (horas antes)"
        value={value.cancelWindowHours}
        onChangeText={(h) => setForm({ ...value, cancelWindowHours: h.replace(/\D/g, '').slice(0, 3) })}
        keyboardType="number-pad"
        maxLength={3}
      />
      {org?.role === 'owner' ? (
        <Pressable onPress={() => router.push('/delete-academy' as never)} className="items-center py-3 active:opacity-70">
          <Text className="text-[13px] font-bold text-destructive">Eliminar academia</Text>
        </Pressable>
      ) : null}
    </FormScreen>
  );
}

/** Paso 3 de 3: sede y primer espacio. Aquí se crea todo de una vez. */
export function AddLocationScreen() {
  const { draft, reset } = useOrgDraft();
  const catalog = useCatalog();
  const create = useCreateOrganization();
  const [loc, setLoc] = useState<LocationValue>(emptyLocation);
  const [tz, setTz] = useState(suggestedZone);
  const [room, setRoom] = useState({ name: '', capacity: '20' });
  const [error, setError] = useState<string>();

  const vertical =
    catalog.data?.find((v) => v.id === draft.verticalId) ??
    catalog.data?.find((v) => v.slug === 'baile') ??
    catalog.data?.find((v) => v.isActive);
  const term = vertical?.terms.room ?? 'Espacio';
  const capacity = parseInt(room.capacity, 10);
  const valid = isLocationValid(loc) && room.name.trim().length >= 1 && capacity >= 1;

  const submit = () => {
    setError(undefined);
    if (!valid) return setError('Completa la dirección, la colonia y el primer espacio.');
    create.mutate(
      {
        name: draft.name.trim(),
        type: draft.type,
        verticalId: draft.verticalId,
        description: draft.description,
        phone: draft.phone,
        instagram: draft.instagram,
        website: draft.website,
        ...toLocationBody(loc),
        // Con colonia del catálogo la zona horaria sale de la ciudad; si no, la que se elija aquí.
        timezone: loc.zoneId ? undefined : tz,
        roomName: room.name,
        roomCapacity: capacity,
      },
      {
        onSuccess: async ({ id }) => {
          reset();
          await enterOrganization(id);
          done(`${draft.name.trim()} está lista`);
        },
        onError: (e) => setError(e.message),
      }
    );
  };

  return (
    <FormScreen title="Ubicación" subtitle="Paso 3 de 3" cta={create.isPending ? 'Creando…' : 'Crear mi espacio'} onSubmit={submit}>
      <LocationFields value={loc} onChange={setLoc} />
      {loc.zoneId ? null : <TimeZoneField value={tz} onChange={setTz} />}
      <Field
        label={`Primer ${term.toLowerCase()}`}
        value={room.name}
        onChangeText={(name) => setRoom({ ...room, name })}
        placeholder={`${term} A`}
        maxLength={60}
      />
      <Field
        label="Capacidad"
        value={room.capacity}
        onChangeText={(c) => setRoom({ ...room, capacity: c.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={5}
      />
      {error ? <Text className="text-[13px] font-semibold text-destructive">{error}</Text> : null}
    </FormScreen>
  );
}

/** Crear o editar un espacio (salón, sala, cancha…). Con `roomId` edita; con `locationId` crea. */
export function AddRoomScreen() {
  const { roomId, locationId } = useLocalSearchParams<{ roomId?: string; locationId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const rooms = useRoomMutations(activeId ?? '');
  const [form, setForm] = useState<{ name: string; capacity: string; note: string } | null>(null);

  const d = detail.data;
  const term = d?.vertical.terms.room ?? 'Espacio';
  const location = d?.locations.find((l) => (roomId ? l.rooms.some((r) => r.id === roomId) : l.id === locationId)) ?? d?.locations[0];
  const existing = location?.rooms.find((r) => r.id === roomId);
  const value = form ?? { name: existing?.name ?? '', capacity: String(existing?.capacity ?? 20), note: existing?.note ?? '' };
  const capacity = parseInt(value.capacity, 10);
  const valid = value.name.trim().length >= 1 && capacity >= 1;
  const editing = !!roomId;

  if (detail.isPending) {
    return (
      <FormScreen title={term} cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }

  const submit = () => {
    if (!valid || !location) return done('Completa el nombre y la capacidad.');
    const body = { name: value.name, capacity, note: value.note };
    const opts = {
      onSuccess: () => done(editing ? 'Cambios guardados' : `${term} agregado`, goBack),
      onError: (e: Error) => done(e.message),
    };
    if (editing) rooms.update.mutate({ roomId: roomId!, ...body }, opts);
    else rooms.create.mutate({ locationId: location.id, ...body }, opts);
  };

  const remove = () =>
    rooms.remove.mutate(roomId!, { onSuccess: () => done(`${term} eliminado`, goBack), onError: (e) => done(e.message) });

  return (
    <FormScreen
      title={editing ? `Editar ${term.toLowerCase()}` : `Agregar ${term.toLowerCase()}`}
      subtitle={d?.name ?? org?.name}
      cta={editing ? 'Guardar cambios' : `Agregar ${term.toLowerCase()}`}
      onSubmit={submit}
      secondary={editing ? { label: `Eliminar ${term.toLowerCase()}`, onPress: remove } : undefined}
    >
      <Field
        label="Nombre"
        value={value.name}
        onChangeText={(name) => setForm({ ...value, name })}
        placeholder={`${term} B`}
        maxLength={60}
      />
      <Field
        label="Capacidad"
        value={value.capacity}
        onChangeText={(c) => setForm({ ...value, capacity: c.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={5}
      />
      <Field
        label="Nota (opcional)"
        value={value.note}
        onChangeText={(note) => setForm({ ...value, note })}
        placeholder="Planta alta"
        maxLength={120}
      />
    </FormScreen>
  );
}

/** Editar dirección y colonia de una sede. */
export function EditLocationScreen() {
  const { locationId } = useLocalSearchParams<{ locationId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const detail = useOrganization(activeId);
  const update = useLocationUpdate(activeId ?? '');
  const [loc, setLoc] = useState<LocationValue | null>(null);

  if (detail.isPending) {
    return (
      <FormScreen title="Editar ubicación" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  const current = detail.data?.locations.find((l) => l.id === locationId) ?? detail.data?.locations[0];
  const value = loc ?? {
    address: current?.address ?? '',
    zoneId: current?.zoneId ?? null,
    neighborhood: current?.neighborhood ?? '',
    city: current?.city ?? '',
    mapsUrl: current?.mapsUrl ?? '',
  };

  return (
    <FormScreen
      title="Editar ubicación"
      subtitle={org?.name}
      cta={update.isPending ? 'Guardando…' : 'Guardar cambios'}
      loading={update.isPending}
      onSubmit={() => {
        if (!current || !isLocationValid(value)) return done('Completa la dirección y la colonia.');
        update.mutate(
          { locationId: current.id, ...toLocationBody(value) },
          { onSuccess: () => done('Ubicación actualizada', goBack), onError: (e) => done(e.message) }
        );
      }}
    >
      <LocationFields value={value} onChange={setLoc} />
    </FormScreen>
  );
}

const roleIcon: Record<string, typeof UserRound> = { instructor: UserRound, staff: ShieldUser, admin: ShieldCheck };

/** Elegir el rol de una persona: los del sistema y los personalizados de la academia (sin dar permisos que no se tienen). */
function RolePicker({
  value,
  onChange,
  isOwner,
  instructorTerm,
}: {
  value: AssignableRole;
  onChange: (r: AssignableRole) => void;
  isOwner: boolean;
  instructorTerm: string;
}) {
  const t = useTheme();
  const { activeId, org } = useActiveOrganization();
  const roles = useRoles(activeId);
  const mine = org?.permissions ?? {};
  const options = (roles.data?.roles ?? []).filter((r) => r.id !== 'owner' && (r.id !== 'admin' || isOwner));
  // Un rol con más permisos de los que tengo no se puede asignar (el servidor lo rechaza igual; aquí se evita el intento).
  const allowed = (perms: Record<string, string[]>) =>
    isOwner || Object.entries(perms).every(([res, acts]) => acts.every((a) => mine[res]?.includes(a)));
  return (
    <FormGroup label="Rol">
      <QueryStatus q={roles} what="los roles" />
      <View className="gap-2">
        {options.map((r) => {
          const ok = allowed(r.permissions);
          const total = Object.values(r.permissions).reduce((n, a) => n + a.length, 0);
          return (
            <Pressable
              key={r.id}
              disabled={!ok}
              onPress={() => onChange(r.id)}
              className={cn(
                'flex-row items-center gap-3 rounded-2xl border-2 bg-card px-3 py-2.5',
                value === r.id ? 'border-primary' : 'border-transparent',
                !ok && 'opacity-40'
              )}
            >
              <Icon as={roleIcon[r.id] ?? ShieldCheck} size={19} color={value === r.id ? t.primary : t.mutedForeground} />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold">{r.id === 'instructor' ? instructorTerm : r.label}</Text>
                <Text className="text-[11.5px] text-muted-foreground">
                  {r.system ? r.description : `Rol personalizado · ${total} ${total === 1 ? 'permiso' : 'permisos'}`}
                  {!ok ? ' · supera tus permisos' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </FormGroup>
  );
}

export function InviteMemberScreen() {
  const { activeId, org } = useActiveOrganization();
  const team = useTeamMutations(activeId ?? '');
  const accounts = useAccountMutations(activeId ?? '', org?.name);
  const [mode, setMode] = useState<'invite' | 'account'>('invite');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('instructor');
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const creating = mode === 'account';

  return (
    <FormScreen
      title={creating ? 'Crear cuenta' : 'Invitar miembro'}
      subtitle={org?.name}
      cta={
        creating
          ? accounts.create.isPending
            ? 'Creando…'
            : 'Crear cuenta'
          : team.invite.isPending
            ? 'Enviando…'
            : 'Enviar invitación'
      }
      onSubmit={() => {
        if (!valid) return done('Escribe un correo válido.');
        if (creating) {
          if (name.trim().length < 2) return done('Escribe el nombre de la persona.');
          return accounts.create.mutate(
            { kind: 'staff', role, name: name.trim(), email: email.trim() },
            { onSuccess: () => router.replace('/account-created' as never), onError: (e) => done(e.message) }
          );
        }
        team.invite.mutate({ email, role }, { onSuccess: () => done('Invitación enviada', goBack), onError: (e) => done(e.message) });
      }}
    >
      <View className="flex-row gap-2">
        <Chip label="Invitar por correo" selected={!creating} onPress={() => setMode('invite')} />
        <Chip label="Crear cuenta con contraseña" selected={creating} onPress={() => setMode('account')} />
      </View>
      {creating ? <Field label="Nombre" value={name} onChangeText={setName} placeholder="Nombre completo" maxLength={100} /> : null}
      <Field
        label="Correo"
        value={email}
        onChangeText={setEmail}
        placeholder="persona@correo.com"
        autoCapitalize="none"
        keyboardType="email-address"
        maxLength={160}
      />
      <RolePicker value={role} onChange={setRole} isOwner={org?.role === 'owner'} instructorTerm={org?.terms.instructor ?? 'Instructor'} />
      {creating ? (
        <InfoBanner
          icon={KeyRound}
          tone="violet"
          text="Crearemos la cuenta con una contraseña temporal que verás una sola vez para compartirla. Al entrar, la persona creará su propia contraseña y quedará ya en tu equipo."
        />
      ) : (
        <InfoBanner
          icon={Mail}
          tone="violet"
          text="La persona verá la invitación al entrar a KompassFlow con ese correo. Una misma cuenta puede estar en varias organizaciones."
        />
      )}
    </FormScreen>
  );
}

/** Detalle de un miembro o invitación: cambiar rol, quitar del equipo o cancelar. */
export function MemberScreen() {
  const { memberId, invitationId } = useLocalSearchParams<{ memberId?: string; invitationId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const team = useTeam(activeId);
  const mut = useTeamMutations(activeId ?? '');
  const accounts = useAccountMutations(activeId ?? '', org?.name);
  const { data: session } = authClient.useSession();
  const member = team.data?.members.find((m) => m.id === memberId);
  const invitation = team.data?.invitations.find((i) => i.id === invitationId);
  const [role, setRole] = useState<AssignableRole | null>(null);
  // Quitar del equipo: primero se revisa qué clases próximas tiene y se decide quién las toma.
  const [removing, setRemoving] = useState(false);
  const [reassign, setReassign] = useState<string | null>(null);
  const preview = useRemovalPreview(activeId, member?.id, removing);
  const transfer = useTransferOwnership(activeId ?? '');
  const sec = useSecurity();
  const [transferring, setTransferring] = useState(false);
  const [password, setPassword] = useState('');

  if (team.isPending) {
    return (
      <FormScreen title="Miembro" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }

  if (invitation) {
    return (
      <FormScreen
        title="Invitación pendiente"
        subtitle={invitation.email}
        cta="Cancelar invitación"
        ctaVariant="destructive"
        onSubmit={() =>
          mut.cancelInvite.mutate(invitation.id, { onSuccess: () => done('Invitación cancelada', goBack), onError: (e) => done(e.message) })
        }
        secondary={{ label: 'Volver', onPress: goBack }}
      >
        <InfoBanner
          icon={Mail}
          tone="amber"
          text={`Invitado como ${roleLabel(invitation.role ?? 'staff', org?.terms.instructor).toLowerCase()}. Vence en 7 días.`}
        />
      </FormScreen>
    );
  }
  if (!member) {
    return (
      <FormScreen title="Miembro" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">No encontramos a esa persona en el equipo.</Text>
      </FormScreen>
    );
  }

  const isMe = member.userId === session?.user.id;
  const isOwnerRow = member.role === 'owner';
  const iAmOwner = org?.role === 'owner';
  const canChange = !isOwnerRow && !isMe && can(org, 'member', 'update') && (iAmOwner || member.role !== 'admin');
  const current = (role ?? (member.role as AssignableRole)) as AssignableRole;

  return (
    <FormScreen
      title={member.name}
      subtitle={member.email ?? roleLabel(member.role, org?.terms.instructor)}
      cta={canChange ? 'Guardar rol' : 'Listo'}
      onSubmit={() => {
        if (!canChange || current === member.role) return goBack();
        mut.changeRole.mutate(
          { memberId: member.id, role: current },
          { onSuccess: () => done('Rol actualizado', goBack), onError: (e) => done(e.message) }
        );
      }}
      secondary={
        !isOwnerRow && (isMe || can(org, 'member', 'delete'))
          ? {
              label: isMe ? 'Salir del equipo' : 'Quitar del equipo',
              onPress: () => setRemoving(true),
            }
          : undefined
      }
    >
      <View className="items-center gap-2 py-1">
        <Avatar uri={member.image} name={member.name} size={72} radius={24} />
        <Badge tone={roleTone[member.role]?.tone ?? 'ink'} appearance={roleTone[member.role]?.solid ? 'solid' : 'soft'}>
          {roleLabel(member.role, org?.terms.instructor)}
        </Badge>
      </View>
      {canChange ? (
        <RolePicker value={current} onChange={setRole} isOwner={iAmOwner} instructorTerm={org?.terms.instructor ?? 'Instructor'} />
      ) : null}
      {canChange ? (
        <View className="gap-2 rounded-[20px] bg-card p-3.5">
          <Text className="text-[13.5px] font-extrabold">Permisos adicionales</Text>
          <Text variant="muted" className="text-xs">
            {member.extraPermissions
              ? `Tiene ${Object.values(member.extraPermissions).reduce((n, a) => n + a.length, 0)} permisos extra sobre su rol.`
              : 'Dale permisos extra a esta persona sin cambiar su rol, o crea con ellos un rol reutilizable.'}
          </Text>
          <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: '/member-permissions', params: { memberId: member.id } } as never)}>
            <Text>{member.extraPermissions ? 'Editar permisos adicionales' : 'Dar permisos adicionales'}</Text>
          </Button>
        </View>
      ) : null}
      {iAmOwner && !isMe && !isOwnerRow && !member.pendingActivation ? (
        <View className="gap-2.5 rounded-[20px] bg-card p-3.5">
          <Text className="text-[13.5px] font-extrabold">Traspasar la academia</Text>
          <Text variant="muted" className="text-xs">
            {member.name} pasará a ser quien tiene el control total: plan, cobros y eliminar la academia. Tú quedarás como administración.
          </Text>
          <Button size="sm" variant="secondary" onPress={() => setTransferring(true)}>
            <Text>Traspasar la academia a esta persona</Text>
          </Button>
        </View>
      ) : null}
      <ConfirmModal
        visible={removing}
        title={isMe ? '¿Salir del equipo?' : `¿Quitar a ${member.name} del equipo?`}
        message={isMe ? 'Dejarás de tener acceso a esta academia.' : 'Dejará de tener acceso a la academia. Esta acción no se puede deshacer, pero puedes volver a invitarla.'}
        confirmLabel={mut.remove.isPending ? 'Quitando…' : isMe ? 'Sí, salir' : 'Sí, quitar'}
        busy={mut.remove.isPending}
        confirmDisabled={!preview.data}
        onCancel={() => {
          setRemoving(false);
          setReassign(null);
        }}
        onConfirm={() =>
          mut.remove.mutate(
            { memberId: member.id, reassignTo: reassign ?? undefined },
            {
              onSuccess: (r) => {
                setRemoving(false);
                done(
                  isMe
                    ? 'Saliste del equipo'
                    : r.moved || r.unassigned
                      ? `Miembro quitado · ${r.moved} ${r.moved === 1 ? 'clase reasignada' : 'clases reasignadas'}${r.unassigned ? `, ${r.unassigned} sin instructor` : ''}`
                      : 'Miembro quitado',
                  () => (isMe ? router.replace('/my-classes') : goBack())
                );
              },
              onError: (e) => done(e.message),
            }
          )
        }
      >
        {preview.isPending ? <ActivityIndicator /> : null}
        {preview.isError ? <Text variant="muted" className="text-xs">{preview.error.message}</Text> : null}
        {preview.data && preview.data.upcoming > 0 ? (
          <View className="gap-2">
            <Text className="text-[13px] font-bold">
              {isMe ? 'Tienes' : 'Tiene'} {preview.data.upcoming} {preview.data.upcoming === 1 ? 'clase próxima' : 'clases próximas'}. ¿Quién las toma?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {preview.data.candidates.map((c) => (
                <Chip key={c.userId} label={c.name} selected={reassign === c.userId} onPress={() => setReassign(c.userId)} onCard />
              ))}
              <Chip label="Sin instructor" selected={reassign === null} onPress={() => setReassign(null)} onCard />
            </View>
            <Text variant="muted" className="text-[11px]">
              Las clases que ya pasaron no cambian. Si alguien tiene otra clase a la misma hora, esa queda sin instructor.
            </Text>
          </View>
        ) : preview.data ? (
          <Text variant="muted" className="text-xs">No imparte clases próximas.</Text>
        ) : null}
      </ConfirmModal>
      <ConfirmModal
        visible={transferring}
        title={`¿Traspasar la academia a ${member.name}?`}
        message={`${member.name} tendrá el control total: plan, cobros y eliminar la academia. Tú quedarás como administración y no podrás deshacerlo por tu cuenta.`}
        confirmLabel={transfer.isPending ? 'Traspasando…' : 'Sí, traspasar'}
        busy={transfer.isPending}
        confirmDisabled={!!sec.data?.hasPassword && !password}
        onCancel={() => {
          setTransferring(false);
          setPassword('');
        }}
        onConfirm={() =>
          transfer.mutate(
            { memberId: member.id, password: sec.data?.hasPassword ? password : undefined },
            {
              onSuccess: () => {
                setTransferring(false);
                setPassword('');
                done(`${member.name} ahora es la persona propietaria`, goBack);
              },
              onError: (e) => done(e.message),
            }
          )
        }
      >
        {sec.data?.hasPassword ? <Field label="Tu contraseña para confirmar" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /> : null}
      </ConfirmModal>
      {isOwnerRow ? <InfoBanner icon={ShieldCheck} tone="teal" text="El propietario tiene control total y no se puede quitar." /> : null}
      {member.pendingActivation ? (
        <View className="gap-2 rounded-[20px] bg-amber-soft px-3.5 py-3">
          <Text className="text-[13px] font-bold text-amber-ink">
            Cuenta por activar: aún no cambia su contraseña temporal. Si la perdió o caducó, genera otra.
          </Text>
          {can(org, 'invitation', 'create') ? (
            <Button
              size="sm"
              variant="dark"
              loading={accounts.reset.isPending}
              onPress={() =>
                accounts.reset.mutate(
                  { userId: member.userId, name: member.name },
                  { onSuccess: () => router.push('/account-created' as never), onError: (e) => done(e.message) }
                )
              }
            >
              <Text>Regenerar contraseña temporal</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </FormScreen>
  );
}

const productKinds = [
  { id: 'SINGLE', label: 'Clase suelta' },
  { id: 'PACKAGE', label: 'Paquete' },
  { id: 'MEMBERSHIP', label: 'Mensualidad' },
] as const;

type ProductForm = {
  kind: 'SINGLE' | 'PACKAGE' | 'MEMBERSHIP';
  name: string;
  price: string;
  credits: string;
  validity: string;
  seats: string;
  visible: boolean;
  active: boolean;
  description: string;
};

/** Crear o editar (con `productId`) un producto: clase suelta, paquete de créditos o mensualidad. */
export function NewProductScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const products = useProducts(activeId);
  const mut = useProductMutations(activeId ?? '');
  const existing = productId ? products.data?.find((p) => p.id === productId) : undefined;
  const [form, setForm] = useState<ProductForm | null>(null);

  if (productId && products.isPending) {
    return (
      <FormScreen title="Producto" cta="Guardar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  const v: ProductForm = form ?? {
    kind: existing?.kind ?? 'PACKAGE',
    name: existing?.name ?? '',
    price: existing ? String(existing.priceCents / 100) : '',
    credits: existing?.credits ? String(existing.credits) : '',
    validity: existing?.validityDays ? String(existing.validityDays) : '',
    seats: existing?.seats ? String(existing.seats) : '1',
    visible: existing?.isVisible ?? true,
    active: existing?.isActive ?? true,
    description: existing?.description ?? '',
  };
  const set = (p: Partial<ProductForm>) => setForm({ ...v, ...p });
  const editing = !!existing;
  const price = parseFloat(v.price.replace(',', '.'));
  const credits = parseInt(v.credits, 10);
  const validity = parseInt(v.validity, 10);
  const seats = parseInt(v.seats, 10) || 1;
  const pending = mut.create.isPending || mut.update.isPending;

  const submit = () => {
    if (v.name.trim().length < 2 || Number.isNaN(price) || price < 0) return done('Indica el nombre y el precio.');
    if (v.kind === 'PACKAGE' && !(credits >= 1)) return done('Indica cuántos créditos incluye el paquete.');
    if (v.kind === 'MEMBERSHIP' && !(validity >= 1)) return done('Indica los días de vigencia de la mensualidad.');
    if (v.kind !== 'SINGLE' && (seats < 1 || seats > 20)) return done('Las personas del paquete deben ser entre 1 y 20.');
    const body = {
      name: v.name,
      seats: v.kind === 'SINGLE' ? 1 : seats,
      description: v.description || undefined,
      priceCents: Math.round(price * 100),
      credits: v.kind === 'PACKAGE' ? credits : undefined,
      validityDays: validity >= 1 ? validity : undefined,
      isVisible: v.visible,
    };
    const opts = {
      onSuccess: () => done(editing ? 'Producto actualizado' : 'Producto creado', goBack),
      onError: (e: Error) => done(e.message),
    };
    if (existing) mut.update.mutate({ productId: existing.id, ...body, isActive: v.active }, opts);
    else mut.create.mutate({ ...body, kind: v.kind }, opts);
  };

  return (
    <FormScreen
      title={editing ? 'Editar producto' : 'Nuevo producto'}
      subtitle={org?.name}
      cta={pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
      loading={pending}
      onSubmit={submit}
    >
      <FormGroup label="Tipo">
        <View className="flex-row flex-wrap gap-2">
          {productKinds.map((k) => (
            <Chip key={k.id} label={k.label} selected={v.kind === k.id} onPress={() => !editing && set({ kind: k.id })} />
          ))}
        </View>
        {editing ? (
          <Text variant="muted" className="text-xs">
            El tipo no se puede cambiar; crea otro producto si lo necesitas.
          </Text>
        ) : null}
      </FormGroup>
      <Field label="Nombre" value={v.name} onChangeText={(name) => set({ name })} placeholder="Paquete 8 clases" maxLength={80} />
      <View className="flex-row gap-2.5">
        <Field
          label="Precio (MXN)"
          value={v.price}
          onChangeText={(price) => set({ price: price.replace(/[^\d.,]/g, '') })}
          placeholder="1200"
          keyboardType="decimal-pad"
          containerClassName="flex-1"
          maxLength={9}
        />
        {v.kind !== 'SINGLE' ? (
          <Field
            label={`Vigencia (días)${v.kind === 'MEMBERSHIP' ? '' : ' · opcional'}`}
            value={v.validity}
            onChangeText={(validity) => set({ validity: validity.replace(/\D/g, '') })}
            placeholder="30"
            keyboardType="number-pad"
            containerClassName="flex-1"
            maxLength={4}
          />
        ) : null}
      </View>
      {v.kind === 'PACKAGE' ? (
        <Field
          label="Créditos (clases incluidas)"
          value={v.credits}
          onChangeText={(credits) => set({ credits: credits.replace(/\D/g, '') })}
          placeholder="8"
          keyboardType="number-pad"
          maxLength={4}
        />
      ) : null}
      {v.kind !== 'SINGLE' ? (
        <View className="gap-1.5">
          <Field
            label="Personas que comparten el paquete"
            value={v.seats}
            onChangeText={(seats) => set({ seats: seats.replace(/\D/g, '') })}
            placeholder="1"
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text variant="muted" className="px-1 text-xs">
            1 = individual. Con 2 o más, el precio es del paquete completo (p. ej. $1,000 para 2 personas) y se paga una sola vez; las
            demás personas se suman después sin necesitar cuenta.
          </Text>
        </View>
      ) : null}
      <Field label="Descripción (opcional)" value={v.description} onChangeText={(description) => set({ description })} maxLength={300} />
      <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[13.5px] font-bold">Visible para alumnos</Text>
          <Text className="text-[11.5px] text-muted-foreground">Aparece en tu perfil público para comprarlo</Text>
        </View>
        <Toggle value={v.visible} onValueChange={(visible) => set({ visible })} />
      </View>
      {editing ? (
        <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-[13.5px] font-bold">Activo</Text>
            <Text className="text-[11.5px] text-muted-foreground">
              Pausado ya no se puede vender; los pases ya vendidos siguen vigentes
            </Text>
          </View>
          <Toggle value={v.active} onValueChange={(active) => set({ active })} />
        </View>
      ) : null}
    </FormScreen>
  );
}
