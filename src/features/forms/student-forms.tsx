import { router, useLocalSearchParams } from 'expo-router';
import CalendarX2 from 'lucide-react-native/icons/calendar-x-2';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FormGroup, FormScreen } from '@/components/form-screen';
import { useMyTransfer, useNotifyTransfer } from '@/features/payments/queries';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useCancelMyBooking, useMyBookings } from '@/features/bookings/queries';
import { formatTime, relativeDay } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import { useNow } from '@/lib/use-now';
import { cancelReasons } from '@/mocks/operations';

/** Cancelar una reserva propia; el servidor valida el plazo de la organización. */
export function CancelBookingScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const upcoming = useMyBookings('upcoming');
  const cancel = useCancelMyBooking();
  const now = useNow();
  const [reason, setReason] = useState(cancelReasons[0]);
  const b = upcoming.data?.find((x) => x.id === bookingId);

  if (upcoming.isPending) {
    return (
      <FormScreen title="Cancelar reserva" cta="Cancelar" onSubmit={() => {}}>
        <ActivityIndicator />
      </FormScreen>
    );
  }
  if (!b) {
    return (
      <FormScreen title="Cancelar reserva" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">Esta reserva ya no está activa.</Text>
      </FormScreen>
    );
  }
  const start = +new Date(b.startsAt);
  const hoursLeft = (start - now) / 3600_000;
  const free = hoursLeft >= b.cancelWindowHours;

  return (
    <FormScreen
      title="Cancelar reserva"
      subtitle={`${b.serviceName} · ${relativeDay(start, b.timezone)} ${formatTime(start, b.timezone)}`}
      cta={cancel.isPending ? 'Cancelando…' : 'Cancelar reserva'}
      ctaVariant="destructive"
      onSubmit={() => cancel.mutate(b.id, { onSuccess: () => done('Reserva cancelada', goBack), onError: (e) => done(e.message) })}
      secondary={{ label: 'Mantener mi lugar', onPress: goBack }}
    >
      <InfoBanner
        icon={CalendarX2}
        tone={free ? 'teal' : 'amber'}
        text={
          free
            ? `Cancelas sin costo: faltan más de ${b.cancelWindowHours} h.`
            : `Faltan menos de ${b.cancelWindowHours} h: ya no puedes cancelar desde la app. Contacta a ${b.organizationName}.`
        }
      />
      <FormGroup label="¿Por qué cancelas? (opcional)">
        <View className="flex-row flex-wrap gap-2">
          {cancelReasons.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
      </FormGroup>
    </FormScreen>
  );
}

/** Avisar que ya se hizo la transferencia, con la clave de rastreo del banco (la academia la busca en su estado de cuenta). */
export function UploadReceiptScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const t = useMyTransfer(paymentId);
  const notify = useNotifyTransfer(paymentId ?? '');
  const [key, setKey] = useState<string | null>(null);
  const value = key ?? t.data?.trackingKey ?? '';

  return (
    <FormScreen
      title="Avisar mi transferencia"
      subtitle={t.data ? `${t.data.concept} · ${t.data.organizationName}` : undefined}
      cta={notify.isPending ? 'Enviando…' : 'Enviar aviso'}
      loading={notify.isPending}
      onSubmit={() => {
        if (value.trim().length < 4) return done('Escribe la clave de rastreo de tu transferencia.');
        notify.mutate(value.trim(), {
          onSuccess: () =>
            done('Aviso enviado · la academia lo revisará', () => router.replace({ pathname: '/transfer', params: { paymentId } })),
          onError: (e) => done(e.message),
        });
      }}
    >
      <Field
        label="Clave de rastreo"
        value={value}
        onChangeText={(v) => setKey(v.toUpperCase())}
        placeholder="MBAN01002603190012345"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={60}
      />
      <Text variant="muted" className="text-xs">
        La encuentras en el comprobante de tu banco. Con ella la academia identifica tu transferencia y confirma el pago.
      </Text>
    </FormScreen>
  );
}
