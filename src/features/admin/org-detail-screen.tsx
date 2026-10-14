import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { useAdminOrg, useGrantPlan } from '@/features/admin/queries';
import { done } from '@/lib/simulate';
import { PLAN_NAME } from '@/features/admin/orgs-screen';
import { formatMoney } from '@/lib/dates';

const day = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';

/** Detalle de una academia para la administración de la plataforma (solo lectura). */
export function AdminOrgDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAdminOrg(id);
  const o = q.data;
  return (
    <Screen>
      <ScreenHeader
        title={o?.name ?? 'Academia'}
        subtitle={o ? `${o.ownerName ?? 'Sin propietario'} · ${o.ownerEmail ?? ''}` : undefined}
      />
      <ScreenScroll contentContainerClassName="gap-3 pb-8">
        <QueryStatus q={q} />
        {o ? (
          <>
            <View className="flex-row items-center gap-3 rounded-[22px] bg-card p-4">
              <Avatar uri={o.logo} name={o.name} size={56} radius={18} />
              <View className="flex-1 gap-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge tone={o.plan === 'free' ? 'ink' : o.planStatus === 'trialing' ? 'amber' : 'green'}>
                    {`PLAN ${(PLAN_NAME[o.plan] ?? o.plan).toUpperCase()}${o.planStatus === 'trialing' ? ' · PRUEBA' : ''}`}
                  </Badge>
                  <Badge tone={o.published ? 'green' : 'ink'}>{o.published ? 'PUBLICADA' : 'OCULTA'}</Badge>
                  <Badge tone={o.cardEnabled ? 'green' : 'ink'}>{o.cardEnabled ? 'COBRA CON TARJETA' : 'SIN TARJETA'}</Badge>
                </View>
                <Text variant="muted" className="text-xs">
                  En KompassFlow desde {day(o.createdAt)}
                </Text>
              </View>
            </View>

            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              <Line label="Alumnos" value={String(o.students)} />
              <Line label="Equipo" value={String(o.members)} />
              <Line label="Ubicaciones" value={String(o.locations)} />
              <Line label="Clases próximas" value={String(o.upcomingSessions)} />
              <Line label="Último pago registrado" value={day(o.lastPaymentAt)} />
            </View>

            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              <Text className="text-sm font-extrabold">Suscripción</Text>
              {o.subscription ? (
                <>
                  <Line label="Plan" value={PLAN_NAME[o.subscription.plan] ?? o.subscription.plan} />
                  <Line
                    label="Estado"
                    value={
                      o.subscription.status === 'trialing'
                        ? 'En prueba'
                        : o.subscription.status === 'past_due'
                          ? 'Pago pendiente'
                          : 'Activa'
                    }
                  />
                  {o.subscription.trialEnd ? <Line label="Prueba hasta" value={day(o.subscription.trialEnd)} /> : null}
                  <Line label="Próximo cobro" value={day(o.subscription.periodEnd)} />
                </>
              ) : (
                <Text variant="muted">Plan Gratis, sin suscripción.</Text>
              )}
            </View>

            <Pressable
              onPress={() => router.push({ pathname: '/admin-verification', params: { id: o.id } } as never)}
              className="flex-row items-center justify-between gap-3 rounded-[22px] bg-card p-4 active:opacity-80"
            >
              <View className="gap-0.5">
                <Text className="text-sm font-extrabold">Verificación</Text>
                <Text variant="muted" className="text-xs">
                  Datos, requisitos y revisión del negocio
                </Text>
              </View>
              <Badge
                tone={
                  o.verificationStatus === 'APPROVED'
                    ? 'green'
                    : o.verificationStatus === 'PENDING'
                      ? 'violet'
                      : o.verificationStatus === 'REJECTED'
                        ? 'amber'
                        : 'ink'
                }
              >
                {{ APPROVED: 'VERIFICADA', PENDING: 'EN REVISIÓN', REJECTED: 'RECHAZADA', NONE: 'SIN SOLICITUD' }[o.verificationStatus] ??
                  o.verificationStatus}
              </Badge>
            </Pressable>

            <GrantPlan orgId={o.id} grant={o.planGrant} />

            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              <Text className="text-sm font-extrabold">Cobros con tarjeta de alumnos</Text>
              <Line label="Pagos" value={String(o.cardPayments)} />
              <Line label="Volumen" value={formatMoney(o.cardVolumeCents, 'MXN')} />
              <Line label="Comisión ganada" value={formatMoney(o.cardFeeCents, 'MXN')} />
            </View>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-[13.5px] text-muted-foreground">{label}</Text>
      <Text className="font-mono-bold text-[13.5px]" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const GRANT_PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'business', label: 'Business' },
];
const DURATIONS: { label: string; days: number | null }[] = [
  { label: '1 mes', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: '1 año', days: 365 },
  { label: 'Sin fecha', days: null },
];

/** Regala un plan por el tiempo que se elija. Al vencer, la academia vuelve sola al plan que paga (o al Gratis). */
function GrantPlan({
  orgId,
  grant,
}: {
  orgId: string;
  grant: { plan: string; expiresAt: Date | string | null; note: string | null } | null;
}) {
  const { grant: g, revoke } = useGrantPlan(orgId);
  const [plan, setPlan] = useState('business');
  const [days, setDays] = useState<number | null>(180);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [now] = useState(() => Date.now());
  const customDays = parseInt(custom, 10);
  const effective = custom ? customDays : days;
  const invalid = custom ? !(customDays >= 1 && customDays <= 730) : false;
  const left = grant?.expiresAt ? Math.max(0, Math.ceil((new Date(grant.expiresAt).getTime() - now) / 86_400_000)) : null;
  return (
    <View className="gap-2.5 rounded-[22px] bg-card p-4">
      <Text className="text-sm font-extrabold">Plan gratuito por tiempo limitado</Text>
      {grant ? (
        <View className="gap-1.5 rounded-2xl bg-teal-soft p-3">
          <Text className="text-[13.5px] font-bold">
            {PLAN_NAME[grant.plan] ?? grant.plan} gratis ·{' '}
            {grant.expiresAt ? `vence el ${day(grant.expiresAt)} (${left} ${left === 1 ? 'día' : 'días'})` : 'sin fecha de vencimiento'}
          </Text>
          {grant.note ? (
            <Text variant="muted" className="text-xs">
              {grant.note}
            </Text>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={revoke.isPending}
            onPress={() => revoke.mutate(undefined, { onSuccess: () => done('Plan otorgado quitado'), onError: (e) => done(e.message) })}
          >
            <Text className="text-[13px]">Quitar ahora</Text>
          </Button>
        </View>
      ) : (
        <Text variant="muted" className="text-xs">
          Al terminar el tiempo la academia vuelve sola a su plan real y, para seguir con este, tendrá que contratarlo con tarjeta.
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        {GRANT_PLANS.map((p) => (
          <Chip key={p.value} label={p.label} selected={plan === p.value} onPress={() => setPlan(p.value)} onCard />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <Chip
            key={d.label}
            label={d.label}
            selected={!custom && days === d.days}
            onPress={() => {
              setCustom('');
              setDays(d.days);
            }}
            onCard
          />
        ))}
      </View>
      <Field
        label="O escribe los días"
        value={custom}
        onChangeText={(v) => setCustom(v.replace(/\D/g, '').slice(0, 3))}
        keyboardType="number-pad"
        placeholder="Ej. 45 (máx. 730)"
      />
      <Field label="Nota interna (opcional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Ej. Acuerdo de lanzamiento" />
      <Button
        size="lg"
        disabled={invalid || g.isPending}
        onPress={() =>
          g.mutate(
            { plan, days: effective ?? null, note: note.trim() || undefined },
            {
              onSuccess: () => done(`${PLAN_NAME[plan]} otorgado${effective ? ` por ${effective} días` : ''}`),
              onError: (e) => done(e.message),
            },
          )
        }
      >
        <Text>{g.isPending ? 'Guardando…' : grant ? 'Cambiar plan otorgado' : 'Otorgar plan'}</Text>
      </Button>
    </View>
  );
}
