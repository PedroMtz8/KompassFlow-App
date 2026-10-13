import { useState } from 'react';
import { View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsDesktop } from '@/lib/use-layout';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useAdminPlans, useUpdatePlan, type AdminPlan } from '@/features/admin/queries';
import { done } from '@/lib/simulate';

const asText = (n: number | null) => (n == null ? '' : String(n));
/** Vacío = sin límite (null); si no, un entero positivo. `undefined` = valor inválido. */
const parseLimit = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : undefined;
};

function Field({
  label,
  hint,
  value,
  onChangeText,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  suffix?: string;
}) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        <Input value={value} onChangeText={onChangeText} keyboardType="decimal-pad" className="h-11 flex-1" />
        {suffix ? <Text className="text-[13px] font-bold text-muted-foreground">{suffix}</Text> : null}
      </View>
      {hint ? <Text className="text-[11px] text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

/** Edita un plan. Los campos se guardan juntos con «Guardar». */
function PlanCard({ plan }: { plan: AdminPlan }) {
  const save = useUpdatePlan();
  const [price, setPrice] = useState(String(plan.priceMxn));
  const [trial, setTrial] = useState(String(plan.trialDays));
  const [students, setStudents] = useState(asText(plan.limits.students));
  const [members, setMembers] = useState(asText(plan.limits.members));
  const [locations, setLocations] = useState(asText(plan.limits.locations));
  const [reports, setReports] = useState(plan.limits.reports);
  const [fee, setFee] = useState(String(plan.cardFeeBps / 100));

  const submit = () => {
    const priceN = Number(price);
    const trialN = Number(trial);
    const feePct = Number(fee.replace(',', '.'));
    const s = parseLimit(students);
    const m = parseLimit(members);
    const l = parseLimit(locations);
    if (plan.priceEditable && !(Number.isInteger(priceN) && priceN >= 1)) return done('El precio debe ser un número entero de pesos.');
    if (plan.priceEditable && !(Number.isInteger(trialN) && trialN >= 0 && trialN <= 90)) return done('Los días de prueba van de 0 a 90.');
    if (s === undefined || m === undefined || l === undefined)
      return done('Los límites son números enteros; déjalos vacíos para «sin límite».');
    if (!(feePct >= 0 && feePct <= 30)) return done('La comisión va de 0% a 30%.');
    const bps = Math.round(feePct * 100);
    save.mutate(
      {
        plan: plan.key,
        changes: {
          ...(plan.priceEditable ? { priceMxn: priceN, trialDays: trialN } : {}),
          maxStudents: s,
          maxMembers: m,
          maxLocations: l,
          reports,
          cardFeeBps: bps,
        },
      },
      { onSuccess: () => done(`${plan.name} guardado`), onError: (e) => done(e.message) },
    );
  };

  return (
    <View className="gap-3.5 rounded-[22px] bg-card p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-lg font-extrabold">{plan.name}</Text>
        {plan.priceEditable && !plan.hasStripePrice ? <Text className="text-[11px] font-bold text-amber">Sin precio en Stripe</Text> : null}
      </View>
      {plan.priceEditable ? (
        <View className="flex-row gap-3">
          <Field
            label="Precio mensual"
            value={price}
            onChangeText={setPrice}
            suffix="MXN"
            hint="Cambiarlo crea un precio nuevo en Stripe; quienes ya pagan conservan el suyo."
          />
          <Field label="Días de prueba" value={trial} onChangeText={setTrial} />
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <Field label="Alumnos" value={students} onChangeText={setStudents} hint="Vacío = sin límite" />
        <Field label="Equipo" value={members} onChangeText={setMembers} hint="Vacío = sin límite" />
        <Field label="Ubicaciones" value={locations} onChangeText={setLocations} hint="Vacío = sin límite" />
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[13.5px] font-bold">Acceso a reportes</Text>
        <Toggle value={reports} onValueChange={setReports} />
      </View>
      <Field
        label="Comisión por cobros con tarjeta"
        value={fee}
        onChangeText={setFee}
        suffix="%"
        hint="Se retiene de cada pago con tarjeta de un alumno a la academia. 0 = sin comisión."
      />
      <Button onPress={submit} loading={save.isPending}>
        <Text>Guardar {plan.name}</Text>
      </Button>
    </View>
  );
}

/** Administración de la plataforma: precios, límites y comisión de cada plan. Solo la ve quien está en PLATFORM_ADMIN_EMAILS. */
export function AdminPlansScreen() {
  const desktop = useIsDesktop();
  const q = useAdminPlans();
  return (
    <Screen>
      <ScreenHeader title="Planes y comisiones" subtitle="Administración de la plataforma" back={!desktop} />
      <ScreenScroll contentContainerClassName="gap-3 pb-10" wide>
        <Text variant="muted" className="text-xs">
          Los cambios aplican de inmediato a los cobros nuevos y a los límites de todas las academias. Un cambio de precio solo afecta a
          quien contrate después.
        </Text>
        <QueryStatus q={q} />
        {q.data?.map((p) => (
          <PlanCard key={`${p.key}-${String(p.updatedAt)}`} plan={p} />
        ))}
      </ScreenScroll>
    </Screen>
  );
}
