import { useLocalSearchParams } from 'expo-router';
import { Banknote, Ellipsis, Landmark, Plus, Shield, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FooterBar } from '@/components/ui/footer-bar';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Input } from '@/components/ui/input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useStudent, useStudents } from '@/features/bookings/queries';
import { useActiveOrganization, useOrganization } from '@/features/organizations/queries';
import { useProducts, useRegisterPayment } from '@/features/payments/queries';
import { formatMoney } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import { cn } from '@/lib/utils';

const methods = [
  { id: 'CASH', label: 'Efectivo', icon: Banknote },
  { id: 'TRANSFER', label: 'Transferencia', icon: Landmark },
  { id: 'OTHER', label: 'Otro', icon: Ellipsis },
] as const;
type Method = (typeof methods)[number]['id'];

/** Registrar un pago manual (efectivo, transferencia u otro). Queda con fecha, hora y usuario en la auditoría. */
export function RegisterPaymentScreen() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const { activeId, org } = useActiveOrganization();
  const currency = useOrganization(activeId).data?.currency ?? 'MXN';
  const products = useProducts(activeId);
  const reg = useRegisterPayment(activeId ?? '');
  const [studentId, setStudentId] = useState<string | undefined>(params.studentId);
  const [q, setQ] = useState('');
  const students = useStudents(activeId, q.trim() || undefined);
  const student = useStudent(activeId, studentId);
  const [productId, setProductId] = useState<string | 'other' | null>(null);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  // Personas que comparten el paquete. `null` = las del pase anterior del mismo producto (renovación).
  const [picked, setPicked] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  // Nombres de quienes se eligen en esta pantalla (la búsqueda se apaga al elegir y ya no los trae).
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  const [mq, setMq] = useState('');
  const found = useStudents(adding ? activeId : null, mq.trim() || undefined);

  const list = (products.data ?? []).filter((p) => p.isActive);
  const product = list.find((p) => p.id === productId);
  const amountStr = amount ?? (product ? String(product.priceCents / 100) : '');
  const amountNum = parseFloat(amountStr.replace(',', '.'));
  const cents = Number.isNaN(amountNum) ? 0 : Math.round(amountNum * 100);
  const valid =
    !!studentId &&
    (product || (productId === 'other' && concept.trim().length >= 2)) &&
    !Number.isNaN(amountNum) &&
    amountNum >= 0 &&
    amountStr !== '';

  const seats = product && product.kind !== 'SINGLE' ? product.seats : 1;
  const previous = student.data?.passes.find((p) => p.productId === product?.id && p.isHolder);
  const defaults = (previous?.members ?? []).filter((m) => !m.isHolder).map((m) => m.studentId);
  const members = (picked ?? defaults).slice(0, Math.max(seats - 1, 0));
  const nameOf = (id: string) =>
    pickedNames[id] ?? previous?.members.find((m) => m.studentId === id)?.name ?? found.data?.find((s) => s.id === id)?.name ?? 'Alumno';

  const submit = () => {
    if (!studentId || !valid) return;
    reg.mutate(
      {
        studentId,
        productId: product?.id,
        concept: product ? undefined : concept,
        amountCents: cents,
        method,
        reference: reference || undefined,
        note: note || undefined,
        memberStudentIds: seats > 1 && members.length ? members : undefined,
      },
      { onSuccess: () => done(`Pago de ${formatMoney(cents, currency)} registrado`, goBack), onError: (e) => done(e.message) }
    );
  };

  // Paso 1: elegir a la persona (si no llegó desde su ficha).
  if (!studentId) {
    return (
      <Screen>
        <ScreenHeader title="Registrar pago" subtitle="¿Quién paga?" />
        <ScreenScroll contentContainerClassName="gap-2.5" keyboardShouldPersistTaps="handled">
          <Input value={q} onChangeText={setQ} placeholder="Buscar alumno" className="h-12" />
          <QueryStatus q={students} />
          {students.data?.length === 0 ? (
            <Text variant="muted">{q ? 'Sin resultados.' : 'Aún no hay alumnos: da de alta uno primero.'}</Text>
          ) : null}
          {students.data?.map((st) => (
            <Pressable
              key={st.id}
              onPress={() => setStudentId(st.id)}
              className="flex-row items-center gap-[11px] rounded-2xl bg-card px-3 py-2.5 active:opacity-80"
            >
              <Avatar uri={st.image} name={st.name} size={40} />
              <Text className="flex-1 text-sm font-bold" numberOfLines={1}>
                {st.name}
              </Text>
            </Pressable>
          ))}
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Registrar pago"
        subtitle={org?.name}
        right={
          <Pressable
            onPress={() => setStudentId(undefined)}
            className="flex-row items-center gap-[7px] rounded-xl bg-card py-[5px] pl-[5px] pr-2.5 active:opacity-80"
          >
            <Avatar uri={student.data?.image} name={student.data?.name} size={28} />
            <Text className="max-w-[110px] text-[12.5px] font-bold" numberOfLines={1}>
              {student.data?.name ?? '…'}
            </Text>
          </Pressable>
        }
      />
      <ScreenScroll contentContainerClassName="gap-[11px]" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center gap-[13px] rounded-[26px] bg-ink p-[18px]">
          <IconTile icon={Banknote} tone="amber" size={44} />
          <View className="flex-1 gap-[3px]">
            <Text className="text-[11.5px] text-[#B9B2C0]">Monto a registrar · {currency}</Text>
            <Text className="font-mono-bold text-[32px] leading-[32px] tracking-[-0.03em] text-white">{formatMoney(cents, currency)}</Text>
          </View>
        </View>

        <SectionHeader title="Concepto" />
        <QueryStatus q={products} />
        {list.map((p) => {
          const selected = productId === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setProductId(p.id);
                setAmount(null);
                setPicked(null);
              }}
              className={cn(
                'flex-row items-center justify-between rounded-2xl border-2 bg-card px-[13px] py-2.5 active:opacity-90',
                selected ? 'border-primary' : 'border-transparent'
              )}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold">{p.name}</Text>
                {p.kind !== 'SINGLE' && p.seats > 1 ? (
                  <Text variant="muted" className="text-[11.5px]">
                    {p.seats} personas
                  </Text>
                ) : null}
              </View>
              <Text className={cn('font-mono-bold text-[13px]', selected ? 'text-primary' : 'text-muted-foreground')}>
                {formatMoney(p.priceCents, currency)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setProductId('other')}
          className={cn(
            'rounded-2xl border-2 bg-card px-[13px] py-2.5 active:opacity-90',
            productId === 'other' ? 'border-primary' : 'border-transparent'
          )}
        >
          <Text className="text-sm font-bold">Otro concepto</Text>
        </Pressable>
        {productId === 'other' ? (
          <Field label="¿Qué se cobra?" value={concept} onChangeText={setConcept} placeholder="Playera, inscripción…" maxLength={120} />
        ) : null}
        {productId ? (
          <Field
            label={`Monto (${currency})`}
            value={amountStr}
            onChangeText={(v) => setAmount(v.replace(/[^\d.,]/g, ''))}
            keyboardType="decimal-pad"
            maxLength={9}
          />
        ) : null}
        {product && product.kind !== 'SINGLE' ? (
          <Text variant="muted" className="text-xs">
            Al registrarlo se crea el pase del alumno ({product.kind === 'PACKAGE' ? `${product.credits} clases` : 'ilimitado'}
            {product.validityDays ? `, vigencia ${product.validityDays} días` : ''}).
          </Text>
        ) : null}

        {seats > 1 ? (
          <View className="gap-2 rounded-[20px] bg-card p-3.5">
            <View className="flex-row items-center gap-2">
              <Icon as={Users} size={16} />
              <Text className="flex-1 text-[13.5px] font-bold">
                Personas del paquete · {members.length + 1} de {seats}
              </Text>
            </View>
            <Text variant="muted" className="text-xs">
              Quien paga ya está incluido. Puedes sumar a las demás ahora o después desde su ficha; no necesitan cuenta.
            </Text>
            {members.map((id) => (
              <View key={id} className="flex-row items-center gap-2.5 rounded-xl bg-muted px-3 py-2">
                <Text className="flex-1 text-[13px] font-bold" numberOfLines={1}>
                  {nameOf(id)}
                </Text>
                <Pressable onPress={() => setPicked(members.filter((m) => m !== id))} accessibilityLabel="Quitar" className="active:opacity-70">
                  <Icon as={X} size={15} />
                </Pressable>
              </View>
            ))}
            {members.length < seats - 1 ? (
              adding ? (
                <View className="gap-2">
                  <Input value={mq} onChangeText={setMq} placeholder="Buscar alumno" className="h-11" />
                  {found.data
                    ?.filter((s) => s.id !== studentId && !members.includes(s.id))
                    .slice(0, 6)
                    .map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setPicked([...members, s.id]);
                          setPickedNames((n) => ({ ...n, [s.id]: s.name }));
                          setAdding(false);
                          setMq('');
                        }}
                        className="flex-row items-center gap-2.5 rounded-xl bg-muted px-3 py-2 active:opacity-80"
                      >
                        <Avatar uri={s.image} name={s.name} size={28} />
                        <Text className="flex-1 text-[13px] font-bold" numberOfLines={1}>
                          {s.name}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              ) : (
                <Pressable onPress={() => setAdding(true)} className="flex-row items-center gap-2 py-1 active:opacity-70">
                  <Icon as={Plus} size={15} />
                  <Text className="text-[13px] font-bold text-primary">Agregar persona</Text>
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}

        <SectionHeader title="Método" />
        <View className="flex-row gap-2">
          {methods.map((m) => {
            const selected = method === m.id;
            const inner = (
              <>
                <Icon as={m.icon} size={19} color={selected ? '#fff' : '#4A4152'} />
                <Text className={cn('text-[12.5px] font-bold', selected ? 'text-white' : 'text-[#4A4152]')}>{m.label}</Text>
              </>
            );
            return (
              <Pressable key={m.id} onPress={() => setMethod(m.id)} className="flex-1 overflow-hidden rounded-[18px]">
                {selected ? (
                  <Gradient tone="orange" style={{ alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6 }}>
                    {inner}
                  </Gradient>
                ) : (
                  <View className="items-center gap-1.5 bg-card px-1.5 py-3">{inner}</View>
                )}
              </Pressable>
            );
          })}
        </View>
        {method !== 'CASH' ? (
          <Field
            label="Referencia (opcional)"
            value={reference}
            onChangeText={setReference}
            placeholder="Clave de rastreo o folio"
            maxLength={60}
          />
        ) : null}
        <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={300} />
        <View className="flex-row items-center gap-1.5">
          <Icon as={Shield} size={14} color="#6B6270" />
          <Text variant="muted" className="text-xs">
            Se guarda con fecha, hora y usuario.
          </Text>
        </View>
      </ScreenScroll>
      <FooterBar>
        <Button size="lg" onPress={submit} disabled={!valid || reg.isPending}>
          <Text className="text-[15.5px]">
            {reg.isPending
              ? 'Registrando…'
              : `Registrar ${formatMoney(cents, currency)} en ${methods.find((m) => m.id === method)!.label.toLowerCase()}`}
          </Text>
        </Button>
      </FooterBar>
    </Screen>
  );
}
