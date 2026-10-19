import { router } from 'expo-router';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import EyeOff from 'lucide-react-native/icons/eye-off';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { QueryStatus } from '@/components/query-status';
import { CheckItem } from '@/components/ui/check-item';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { useActiveOrganization, useRequestVerification, useVerification } from '@/features/organizations/queries';
import { done } from '@/lib/simulate';
import { goBack } from '@/lib/nav';

/** Dónde se corrige cada requisito. */
const FIX: Record<string, string> = {
  logo: '/edit-academy',
  cover: '/edit-academy',
  description: '/edit-academy',
  contact: '/edit-academy',
  location: '/rooms',
  service: '/services',
  product: '/pricing',
};

/** Publicar en Descubrir: requisitos del perfil y solicitud de verificación a la plataforma. */
export function VerificationScreen() {
  const { activeId, org } = useActiveOrganization();
  const v = useVerification(activeId);
  const request = useRequestVerification(activeId ?? '');
  const [message, setMessage] = useState('');
  const d = v.data;
  const can = org?.role === 'owner' || org?.role === 'admin';
  const pending = d?.status === 'PENDING';
  const approved = d?.status === 'APPROVED';

  return (
    <FormScreen
      title="Publicar en Descubrir"
      subtitle={org?.name}
      cta={
        approved
          ? 'Listo'
          : pending
            ? 'En revisión'
            : request.isPending
              ? 'Enviando…'
              : d?.status === 'REJECTED'
                ? 'Volver a solicitar'
                : 'Solicitar publicación'
      }
      loading={request.isPending}
      disabled={!d || pending || (!approved && (!d.canRequest || !can))}
      onSubmit={() => {
        if (approved) return goBack();
        request.mutate(message, {
          onSuccess: () => done('Solicitud enviada. Te avisaremos cuando la revisemos.', goBack),
          onError: (e) => done(e.message),
        });
      }}
    >
      <QueryStatus q={v} />
      {d ? (
        <>
          {approved ? (
            <InfoBanner
              icon={BadgeCheck}
              tone="green"
              text={
                d.isPublished
                  ? 'Tu negocio está verificado y visible en Descubrir.'
                  : 'Tu negocio está verificado. Actívalo desde Editar cuando quieras mostrarlo.'
              }
            />
          ) : null}
          {pending ? (
            <InfoBanner
              icon={Clock}
              tone="violet"
              text="Estamos revisando tu solicitud. Comprobamos que tu negocio exista (sitio web, redes o una llamada). Te avisaremos en cuanto terminemos."
            />
          ) : null}
          {d.status === 'REJECTED' ? (
            <InfoBanner
              icon={ShieldAlert}
              tone="amber"
              text={`No pudimos verificar tu negocio${d.reason ? `: ${d.reason}` : '.'} Corrige lo necesario y vuelve a solicitarlo.`}
            />
          ) : null}
          {d.status === 'NONE' ? (
            <InfoBanner
              icon={EyeOff}
              tone="amber"
              text="Tu negocio está oculto. Completa estos puntos y pide la revisión: antes de mostrarse en Descubrir verificamos que sea real."
            />
          ) : null}

          <View className="gap-1 rounded-[22px] bg-card p-4">
            <Text className="pb-1 text-sm font-extrabold">Requisitos</Text>
            {d.checklist.map((c) => {
              const go = !c.ok && can && !approved && !pending;
              return (
                <Pressable
                  key={c.key}
                  disabled={!go}
                  onPress={() => router.push(FIX[c.key] as never)}
                  className="flex-row items-center gap-2 py-2 active:opacity-70"
                >
                  <View className="flex-1 gap-0.5">
                    <CheckItem label={c.label} state={c.ok ? 'ok' : 'warn'} />
                    {!c.ok ? <Text className="pl-7 text-[11.5px] text-muted-foreground">{c.hint}</Text> : null}
                  </View>
                  {go ? <Icon as={ChevronRight} size={16} /> : null}
                </Pressable>
              );
            })}
          </View>

          {d.canRequest && can ? (
            <Field
              label="Algo que nos ayude a verificarte (opcional)"
              value={message}
              onChangeText={setMessage}
              placeholder="Tu página, Instagram o el mejor horario para llamarte"
              maxLength={500}
              multiline
            />
          ) : null}
          {!can ? <Text variant="muted">Solo la persona propietaria o administradora puede pedir la publicación.</Text> : null}
        </>
      ) : null}
    </FormScreen>
  );
}
