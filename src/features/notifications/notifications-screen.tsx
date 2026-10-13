import { router } from 'expo-router';
import { BellRing, CalendarClock, CreditCard, Info } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { enablePush, pushStatus, type PushResult } from '@/features/notifications/push';
import { useMarkRead, useNotificationPrefs, useNotifications, useSaveNotificationPrefs, type NotificationItem } from '@/features/notifications/queries';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const icon = { reminder: CalendarClock, class: CalendarClock, payment: CreditCard, team: Info } as const;

const ago = (d: Date | string) => {
  const mins = Math.round((Date.now() - +new Date(d)) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / (24 * 60));
  return days === 1 ? 'ayer' : `hace ${days} días`;
};

const pushMessage: Record<Exclude<PushResult, 'ok'>, string> = {
  denied: 'Los avisos del teléfono están bloqueados. Actívalos en los Ajustes del teléfono para esta app.',
  unsupported: 'Los avisos del teléfono no están disponibles en esta versión de la app (hay que reinstalarla con la versión nueva). Mientras tanto verás los avisos aquí.',
  'no-project': 'Los avisos del teléfono estarán disponibles en la app instalada desde la tienda. Mientras tanto verás los avisos aquí.',
  error: 'No pudimos activar los avisos del teléfono. Inténtalo de nuevo.',
};

/** Bandeja de avisos: recordatorios, cambios en tus clases y pagos; con preferencias y avisos en el teléfono. */
export function NotificationsScreen() {
  const t = useTheme();
  const q = useNotifications();
  const mark = useMarkRead();
  const prefs = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const [push, setPush] = useState<'on' | 'off' | 'unsupported'>('unsupported');
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushStatus().then(setPush);
  }, []);

  const open = (n: NotificationItem) => {
    if (!n.readAt) mark.mutate([n.id]);
    if (n.url && n.url.startsWith('/') && !n.url.startsWith('//')) router.push(n.url as never);
  };

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    if (r === 'ok') {
      setPush('on');
      setPushNote(null);
    } else setPushNote(pushMessage[r]);
  };

  const p = prefs.data;
  const set = (k: 'reminders' | 'classChanges' | 'payments', v: boolean) =>
    p && save.mutate({ reminders: p.reminders, classChanges: p.classChanges, payments: p.payments, team: p.team, [k]: v });
  const items = q.data?.items ?? [];

  return (
    <Screen>
      <ScreenHeader title="Avisos" subtitle={q.data?.unread ? `${q.data.unread} sin leer` : undefined} />
      <ScreenScroll contentContainerClassName="gap-3 pb-10">
        {Platform.OS !== 'web' && push !== 'on' ? (
          <View className="gap-2.5 rounded-[22px] bg-card p-3.5">
            <View className="flex-row items-center gap-3">
              <BellRing size={22} color={t.primary} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-[13.5px] font-bold">Recibe avisos en tu teléfono</Text>
                <Text variant="muted" className="text-xs">Te recordamos tu clase una hora antes y te avisamos si se cancela o cambia.</Text>
              </View>
            </View>
            <Button size="sm" disabled={busy} onPress={turnOn}>
              <Text>{busy ? 'Activando…' : 'Activar avisos'}</Text>
            </Button>
            {pushNote ? <InfoBanner icon={Info} tone="amber" text={pushNote} /> : null}
          </View>
        ) : null}

        <QueryStatus q={q} />
        {q.data && items.length === 0 ? (
          <View className="items-center gap-1.5 rounded-[22px] bg-card p-6">
            <Text className="text-base font-extrabold">Todo al día</Text>
            <Text variant="muted" className="text-center">Aquí aparecerán tus recordatorios de clase, cambios y pagos.</Text>
          </View>
        ) : null}

        {items.length ? (
          <>
            <View className="flex-row items-center justify-between">
              <SectionHeader title="Recientes" className="pt-0.5" />
              {q.data?.unread ? (
                <Pressable onPress={() => mark.mutate(undefined)} hitSlop={8}>
                  <Text className="text-[12.5px] font-bold text-primary">Marcar todo como leído</Text>
                </Pressable>
              ) : null}
            </View>
            <View className="-mt-1.5">
              {items.map((n, i) => (
                <View key={n.id}>
                  <Pressable onPress={() => open(n)} className="flex-row items-start gap-3 py-[10px] active:opacity-80">
                    <View className={cn('mt-0.5 h-[34px] w-[34px] items-center justify-center rounded-[12px]', n.readAt ? 'bg-muted' : 'bg-primary-soft')}>
                      {(() => {
                        const I = icon[n.category];
                        return <I size={17} color={n.readAt ? t.subtle : t.primary} />;
                      })()}
                    </View>
                    <View className="min-w-0 flex-1 gap-[3px]">
                      <Text className={cn('text-sm', n.readAt ? 'font-semibold' : 'font-extrabold')}>{n.title}</Text>
                      <Text variant="muted" className="text-[12.5px] leading-[18px]">{n.body}</Text>
                      <Text className="text-[11px] text-subtle">{ago(n.createdAt)}</Text>
                    </View>
                    {!n.readAt ? <View className="mt-2 h-2 w-2 rounded-full bg-primary" /> : null}
                  </Pressable>
                  {i < items.length - 1 ? <ListDivider /> : null}
                </View>
              ))}
            </View>
            <LoadMore q={q} label="Ver avisos anteriores" />
          </>
        ) : null}

        <SectionHeader title="Qué avisos quiero" className="pt-2" />
        <View className="gap-1 rounded-[22px] bg-card px-3.5 py-1">
          {([
            ['reminders', 'Recordatorio de mi clase', 'Una hora antes de que empiece'],
            ['classChanges', 'Cambios en mis clases', 'Cuando la academia cancela o te reserva'],
            ['payments', 'Pagos y paquetes', 'Pago recibido, transferencia confirmada, paquete por vencer'],
          ] as const).map(([k, title, note], i) => (
            <View key={k}>
              {i > 0 ? <ListDivider /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-[13.5px] font-bold">{title}</Text>
                  <Text className="text-[11.5px] text-muted-foreground">{note}</Text>
                </View>
                <Toggle value={p ? p[k] : true} onValueChange={(v) => set(k, v)} />
              </View>
            </View>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
