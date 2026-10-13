import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useAdminUser, useSuspendUser } from '@/features/admin/queries';
import { roleLabel } from '@/features/organizations/space';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';

const day = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';

/** Detalle de una cuenta: academias, actividad y suspensión. */
export function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAdminUser(id);
  const { suspend, reactivate } = useSuspendUser(id ?? '');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const u = q.data;
  return (
    <Screen>
      <ScreenHeader title={u?.name ?? 'Usuario'} subtitle={u?.email} />
      <ScreenScroll contentContainerClassName="gap-3 pb-10" keyboardShouldPersistTaps="handled">
        <QueryStatus q={q} />
        {u ? (
          <>
            <View className="flex-row items-center gap-3 rounded-[22px] bg-card p-4">
              <Avatar uri={u.image} name={u.name} size={56} />
              <View className="flex-1 gap-1.5">
                <View className="flex-row flex-wrap gap-2">
                  {u.isPlatformAdmin ? <Badge tone="ink">ADMIN</Badge> : null}
                  <Badge tone={u.emailVerified ? 'green' : 'amber'}>{u.emailVerified ? 'CORREO CONFIRMADO' : 'SIN CONFIRMAR'}</Badge>
                  {u.suspension ? <Badge tone="pink">SUSPENDIDA</Badge> : null}
                </View>
                <Text variant="muted" className="text-xs">
                  Registrada el {day(u.createdAt)} · última actividad {day(u.lastActiveAt)}
                </Text>
              </View>
            </View>

            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              <Line label="Reservas" value={String(u.bookings)} />
              <Line label="Pagos como alumno" value={`${u.paidCount} · ${formatMoney(u.paidCents, 'MXN')}`} />
              <Line label="Sesiones abiertas" value={String(u.openSessions)} />
            </View>

            <View className="gap-2.5 rounded-[22px] bg-card p-4">
              <Text className="text-sm font-extrabold">Academias</Text>
              {u.organizations.length === 0 && u.studentIn.length === 0 ? <Text variant="muted">No pertenece a ninguna.</Text> : null}
              {u.organizations.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => router.push({ pathname: '/admin-org', params: { id: o.id } } as never)}
                  className="flex-row items-center justify-between gap-3 active:opacity-70"
                >
                  <Text className="flex-1 text-[13.5px] font-bold" numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Badge tone={o.role === 'owner' ? 'ink' : 'violet'}>{roleLabel(o.role).toUpperCase()}</Badge>
                </Pressable>
              ))}
              {u.studentIn.map((o) => (
                <Pressable
                  key={`s-${o.id}`}
                  onPress={() => router.push({ pathname: '/admin-org', params: { id: o.id } } as never)}
                  className="flex-row items-center justify-between gap-3 active:opacity-70"
                >
                  <Text className="flex-1 text-[13.5px] font-bold" numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Badge tone="green">ALUMNO</Badge>
                </Pressable>
              ))}
            </View>

            {u.suspension ? (
              <View className="gap-2.5 rounded-[22px] bg-card p-4">
                <Text className="text-sm font-extrabold">Cuenta suspendida</Text>
                <Text className="text-[13.5px]">{u.suspension.reason}</Text>
                <Text variant="muted" className="text-xs">
                  Desde el {day(u.suspension.at)}. No puede iniciar sesión ni usar la app.
                </Text>
                <Button
                  disabled={reactivate.isPending}
                  onPress={() =>
                    reactivate.mutate(undefined, { onSuccess: () => done('Cuenta reactivada'), onError: (e) => done(e.message) })
                  }
                >
                  <Text>{reactivate.isPending ? 'Reactivando…' : 'Reactivar cuenta'}</Text>
                </Button>
              </View>
            ) : !u.isPlatformAdmin ? (
              <View className="gap-2.5 rounded-[22px] bg-card p-4">
                <Text className="text-sm font-extrabold">Suspender cuenta</Text>
                {open ? (
                  <>
                    <Field
                      label="Motivo (interno)"
                      value={reason}
                      onChangeText={setReason}
                      maxLength={300}
                      multiline
                      placeholder="Ej. Reservas falsas reportadas por varias academias"
                    />
                    <Text variant="muted" className="text-xs">
                      Se cierran sus sesiones y no podrá volver a entrar. Sus academias no se ocultan; para eso, suspéndelas desde
                      Solicitudes.
                    </Text>
                    <Button
                      variant="destructive"
                      disabled={reason.trim().length < 5 || suspend.isPending}
                      onPress={() =>
                        suspend.mutate(reason.trim(), {
                          onSuccess: () => {
                            setOpen(false);
                            setReason('');
                            done('Cuenta suspendida');
                          },
                          onError: (e) => done(e.message),
                        })
                      }
                    >
                      <Text>{suspend.isPending ? 'Suspendiendo…' : 'Suspender cuenta'}</Text>
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onPress={() => setOpen(true)}>
                    <Text>Suspender…</Text>
                  </Button>
                )}
              </View>
            ) : null}

            {u.recentActions.length ? (
              <View className="gap-2 rounded-[22px] bg-card p-4">
                <Text className="text-sm font-extrabold">Últimas acciones</Text>
                {u.recentActions.map((a, i) => (
                  <Text key={i} variant="muted" className="text-xs">
                    {day(a.at)} · {a.action}
                  </Text>
                ))}
              </View>
            ) : null}
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
