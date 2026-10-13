import { router, useLocalSearchParams } from 'expo-router';
import { Banknote, Shield, Ticket } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';

import { ErrorNotice } from '@/components/query-status';
import { useTheme } from '@/lib/theme';
import { FormScreen } from '@/components/form-screen';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { OptionRow } from '@/components/ui/option-row';
import { Text } from '@/components/ui/text';
import { useBookSession, useDiscoverSession } from '@/features/bookings/queries';
import { passNote } from '@/features/student/pass-note';
import { formatMoney, formatTime, localDateOf, longDate } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';

/** Confirmar reserva. Por ahora el pago es en el lugar; tarjeta y transferencia llegan con la fase de pagos. */
export function CheckoutScreen() {
  const t = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const q = useDiscoverSession(sessionId);
  const book = useBookSession();
  const s = q.data;

  if (q.isPending) {
    return (
      <FormScreen title="Confirmar reserva" cta="Reservar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (q.isError) return <ErrorNotice fill what="la clase" busy={q.isFetching} onRetry={q.refetch} />;
  if (!s) {
    return (
      <FormScreen title="Confirmar reserva" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">Esta clase ya no está disponible.</Text>
      </FormScreen>
    );
  }

  const start = +new Date(s.startsAt);
  const note = passNote(s.pass);

  return (
    <FormScreen
      title="Confirmar reserva"
      subtitle={s.organizationName}
      cta={book.isPending ? 'Reservando…' : 'Reservar mi lugar'}
      onSubmit={() =>
        book.mutate(s.id, {
          onSuccess: (r) => router.replace({ pathname: '/confirmation', params: { sessionId: s.id, bookingId: r.id } }),
          onError: (e) => done(e.message),
        })
      }
    >
      <View className="gap-1 rounded-[22px] bg-ink p-4">
        <Text className="text-base font-extrabold text-white">{s.serviceName}</Text>
        <Text className="text-xs text-white/80">
          {longDate(localDateOf(start, s.timezone))} · {formatTime(start, s.timezone)} · {s.roomName ?? s.organizationName}
        </Text>
        <Text className="font-mono-bold pt-1 text-lg text-white">{s.priceCents ? formatMoney(s.priceCents, s.currency) : 'Gratis'}</Text>
      </View>

      {note ? <InfoBanner icon={Ticket} tone={note.covered ? 'teal' : 'amber'} text={note.text} /> : null}
      <Text className="pt-1 text-[15px] font-extrabold">¿Cómo quieres pagar?</Text>
      <OptionRow
        title={note?.covered ? 'Con tu paquete' : 'En el lugar'}
        note={note?.covered ? 'No pagas nada extra por esta clase' : 'Efectivo o terminal al llegar a la clase'}
        selected
        onPress={() => {}}
        leading={
          <View className="h-[38px] w-[38px] items-center justify-center rounded-[13px] bg-amber-soft">
            <Icon as={Banknote} size={18} color={t.amberDark} />
          </View>
        }
      />
      <InfoBanner icon={Shield} tone="violet" text="Pago con tarjeta, Mercado Pago y transferencia: próximamente." />
      <Text variant="muted" className="text-xs">
        Cancela sin costo hasta {s.cancelWindowHours} h antes. Cobra {s.organizationName}.
      </Text>
    </FormScreen>
  );
}
