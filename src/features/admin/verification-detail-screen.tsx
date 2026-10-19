import { useLocalSearchParams } from 'expo-router';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Globe from 'lucide-react-native/icons/globe';
import MapPin from 'lucide-react-native/icons/map-pin';
import Phone from 'lucide-react-native/icons/phone';
import Search from 'lucide-react-native/icons/search';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckItem } from '@/components/ui/check-item';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useAdminVerification, useReviewVerification, type VerificationMethod } from '@/features/admin/queries';
import { formatMoney } from '@/lib/dates';
import { done } from '@/lib/simulate';

const day = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';
const METHODS: { value: VerificationMethod; label: string }[] = [
  { value: 'WEBSITE', label: 'Sitio web' },
  { value: 'SOCIAL', label: 'Redes sociales' },
  { value: 'PHONE', label: 'Llamada' },
  { value: 'OTHER', label: 'Otro' },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label])) as Record<string, string>;
const KIND: Record<string, string> = { SINGLE: 'Clase suelta', PACKAGE: 'Paquete', MEMBERSHIP: 'Membresía' };

const webUrl = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const igUrl = (s: string) => (/instagram\.com/i.test(s) ? webUrl(s) : `https://instagram.com/${s.replace(/^@/, '').trim()}`);
const open = (url: string) => Linking.openURL(url).catch(() => done('No se pudo abrir el enlace'));

/** Revisión de una solicitud: datos del negocio, atajos para comprobar que existe y aprobar o rechazar. */
export function AdminVerificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useAdminVerification(id);
  const { approve, reject } = useReviewVerification(id ?? '');
  const [method, setMethod] = useState<VerificationMethod | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const o = q.data;
  const pending = o?.status === 'PENDING';
  const approved = o?.status === 'APPROVED';
  const cityQuery = o ? `${o.name} ${o.locations[0]?.city ?? ''}`.trim() : '';

  return (
    <Screen>
      <ScreenHeader
        title={o?.name ?? 'Solicitud'}
        subtitle={o ? `${o.type === 'PERSONAL' ? 'Independiente' : 'Academia'} · ${o.vertical}` : undefined}
      />
      <ScreenScroll contentContainerClassName="gap-3 pb-10" keyboardShouldPersistTaps="handled">
        <QueryStatus q={q} />
        {o ? (
          <>
            <View className="flex-row items-center gap-3 rounded-[22px] bg-card p-4">
              <Avatar uri={o.logo} name={o.name} size={56} radius={18} />
              <View className="flex-1 gap-1.5">
                <View className="flex-row flex-wrap gap-2">
                  <Badge tone={pending ? 'violet' : approved ? 'green' : o.status === 'REJECTED' ? 'amber' : 'ink'}>
                    {pending
                      ? 'EN REVISIÓN'
                      : approved
                        ? o.isPublished
                          ? 'VERIFICADA · VISIBLE'
                          : 'VERIFICADA · OCULTA'
                        : o.status === 'REJECTED'
                          ? 'RECHAZADA'
                          : 'SIN SOLICITUD'}
                  </Badge>
                </View>
                <Text variant="muted" className="text-xs">
                  {pending
                    ? `Solicitada el ${day(o.requestedAt)}`
                    : o.reviewedAt
                      ? `Revisada el ${day(o.reviewedAt)}${o.method ? ` · ${METHOD_LABEL[o.method] ?? o.method}` : ''}`
                      : `Creada el ${day(o.createdAt)}`}
                </Text>
              </View>
            </View>

            {o.message ? (
              <Card title="Mensaje del negocio">
                <Text className="text-[13.5px]">{o.message}</Text>
              </Card>
            ) : null}

            <Card title="Comprobar que existe">
              {o.website ? <Action icon={Globe} label={o.website} hint="Abrir sitio web" onPress={() => open(webUrl(o.website!))} /> : null}
              {o.instagram ? (
                <Action icon={ExternalLink} label={o.instagram} hint="Abrir Instagram" onPress={() => open(igUrl(o.instagram!))} />
              ) : null}
              {o.phone ? (
                <Action icon={Phone} label={o.phone} hint="Llamar" onPress={() => open(`tel:${o.phone!.replace(/[^\d+]/g, '')}`)} />
              ) : null}
              {o.locations[0]?.mapsUrl ? (
                <Action
                  icon={MapPin}
                  label={o.locations[0].address}
                  hint="Ver en Google Maps"
                  onPress={() => open(o.locations[0].mapsUrl!)}
                />
              ) : null}
              <Action
                icon={Search}
                label={`Buscar «${cityQuery}»`}
                hint="Buscar en internet"
                onPress={() => open(`https://www.google.com/search?q=${encodeURIComponent(cityQuery)}`)}
              />
              {o.owner ? (
                <Text variant="muted" className="pt-1 text-xs">
                  Propietario: {o.owner.name} · {o.owner.email}
                  {o.owner.emailVerified ? ' (correo confirmado)' : ' (correo sin confirmar)'}
                </Text>
              ) : null}
            </Card>

            <Card title="Perfil">
              {o.description ? <Text className="text-[13.5px]">{o.description}</Text> : <Text variant="muted">Sin descripción.</Text>}
              {o.locations.map((l, i) => (
                <Text key={i} variant="muted" className="text-xs">
                  {l.address}
                  {l.neighborhood ? `, ${l.neighborhood}` : ''}, {l.city}
                  {l.rooms.length ? ` · ${l.rooms.join(', ')}` : ''}
                </Text>
              ))}
              {o.services.length ? (
                <Text variant="muted" className="text-xs">
                  Clases: {o.services.join(', ')}
                </Text>
              ) : null}
              {o.products.map((p, i) => (
                <Text key={i} variant="muted" className="text-xs">
                  {KIND[p.kind] ?? p.kind} · {p.name} · {formatMoney(p.priceCents, 'MXN')}
                </Text>
              ))}
            </Card>

            <Card title="Requisitos">
              {o.checklist.map((c) => (
                <CheckItem key={c.key} label={c.label} state={c.ok ? 'ok' : 'warn'} />
              ))}
            </Card>

            {o.reason ? (
              <Card title="Último motivo de rechazo">
                <Text className="text-[13.5px]">{o.reason}</Text>
              </Card>
            ) : null}
            {o.note ? (
              <Card title="Nota interna">
                <Text className="text-[13.5px]">{o.note}</Text>
              </Card>
            ) : null}

            {pending ? (
              <>
                <Card title="Aprobar">
                  <Text variant="muted" className="text-xs">
                    ¿Cómo comprobaste que existe?
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {METHODS.map((m) => (
                      <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} onCard />
                    ))}
                  </View>
                  <Field
                    label="Nota interna (opcional, no la ve el negocio)"
                    value={note}
                    onChangeText={setNote}
                    maxLength={500}
                    multiline
                  />
                  <Button
                    size="lg"
                    disabled={!method || approve.isPending}
                    onPress={() =>
                      approve.mutate(
                        { method: method!, note: note.trim() || undefined },
                        { onSuccess: () => done('Negocio verificado y publicado'), onError: (e) => done(e.message) },
                      )
                    }
                  >
                    <Text>{approve.isPending ? 'Aprobando…' : 'Aprobar y publicar'}</Text>
                  </Button>
                </Card>
                <RejectCard
                  title="Rechazar"
                  cta="Rechazar solicitud"
                  open
                  reason={reason}
                  setReason={setReason}
                  busy={reject.isPending}
                  onSubmit={() =>
                    reject.mutate(
                      { reason: reason.trim() },
                      { onSuccess: () => done('Solicitud rechazada'), onError: (e) => done(e.message) },
                    )
                  }
                />
              </>
            ) : null}
            {approved ? (
              <RejectCard
                title="Suspender"
                cta="Suspender y ocultar"
                open={rejecting}
                onOpen={() => setRejecting(true)}
                reason={reason}
                setReason={setReason}
                busy={reject.isPending}
                onSubmit={() =>
                  reject.mutate(
                    { reason: reason.trim() },
                    { onSuccess: () => done('Negocio suspendido y oculto'), onError: (e) => done(e.message) },
                  )
                }
              />
            ) : null}

            {o.history.length ? (
              <Card title="Historial">
                {o.history.map((h, i) => (
                  <Text key={i} variant="muted" className="text-xs">
                    {day(h.at)} ·{' '}
                    {h.action.endsWith('requested')
                      ? 'Solicitó verificación'
                      : h.action.endsWith('approved')
                        ? 'Aprobada'
                        : 'Rechazada o suspendida'}
                  </Text>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5 rounded-[22px] bg-card p-4">
      <Text className="text-sm font-extrabold">{title}</Text>
      {children}
    </View>
  );
}

function Action({ icon, label, hint, onPress }: { icon: typeof Globe; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 rounded-2xl bg-muted px-3 py-2.5 active:opacity-80">
      <Icon as={icon} size={17} />
      <View className="min-w-0 flex-1">
        <Text className="text-[13.5px] font-bold" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-[11px] text-muted-foreground">{hint}</Text>
      </View>
      <Icon as={ExternalLink} size={14} />
    </Pressable>
  );
}

function RejectCard(p: {
  title: string;
  cta: string;
  open: boolean;
  onOpen?: () => void;
  reason: string;
  setReason: (s: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <Card title={p.title}>
      {p.open ? (
        <>
          <Field
            label="Motivo (lo verá el negocio)"
            value={p.reason}
            onChangeText={p.setReason}
            maxLength={500}
            multiline
            placeholder="Ej. No pudimos comunicarnos al teléfono"
          />
          <Button size="lg" variant="destructive" disabled={p.reason.trim().length < 5 || p.busy} onPress={p.onSubmit}>
            <Text>{p.busy ? 'Guardando…' : p.cta}</Text>
          </Button>
        </>
      ) : (
        <Button variant="secondary" onPress={p.onOpen}>
          <Text>{p.cta}</Text>
        </Button>
      )}
    </Card>
  );
}
