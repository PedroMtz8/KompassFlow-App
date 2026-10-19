import { router } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import { Pressable, View } from 'react-native';

import { FormGroup } from '@/components/form-screen';
import { Screen, ScreenScroll } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { Photo } from '@/components/ui/photo';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useCatalog } from '@/features/interests/queries';
import { cn } from '@/lib/utils';
import { photos } from '@/mocks/photos';
import { useOrgDraft } from '@/stores/org-draft';

const kinds = [
  { id: 'STUDIO', title: 'Academia o estudio', desc: 'Espacios, staff, alumnos y membresías', photo: photos.studio },
  { id: 'PERSONAL', title: 'Instructor independiente', desc: 'Privadas y grupales a tu nombre', photo: photos.personal },
] as const;

/** Alta de organización · paso 1 de 3: tipo, nombre y (si hay más de uno activo) rubro. */
export function CreateOrgScreen() {
  const { draft, patch } = useOrgDraft();
  const catalog = useCatalog();
  const activeVerticals = (catalog.data ?? []).filter((v) => v.isActive);
  // El rubro solo se pregunta cuando hay más de uno activo; con uno solo se asigna por defecto.
  const askVertical = activeVerticals.length > 1;
  const valid = draft.name.trim().length >= 2 && (!askVertical || !!draft.verticalId);

  return (
    <Screen>
      <ScreenHeader title="Crea tu espacio" subtitle="Paso 1 de 3" />
      <ScreenScroll contentContainerClassName="gap-3" keyboardShouldPersistTaps="handled">
        {kinds.map((k) => {
          const selected = draft.type === k.id;
          return (
            <Pressable
              key={k.id}
              onPress={() => patch({ type: k.id })}
              className={cn(
                'overflow-hidden rounded-3xl border-[2.5px] bg-card border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)]',
                selected ? 'border-primary' : 'border-transparent'
              )}
            >
              <View>
                <Photo uri={k.photo} height={104} />
                <View className="absolute left-3 top-3">
                  <Badge appearance="white">{k.id}</Badge>
                </View>
                {selected ? (
                  <View className="absolute right-3 top-3 h-[26px] w-[26px] items-center justify-center rounded-full bg-primary">
                    <Icon as={Check} size={15} color="#fff" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <View className="gap-[3px] px-3.5 py-3">
                <Text className="text-[15.5px] font-extrabold">{k.title}</Text>
                <Text variant="muted">{k.desc}</Text>
              </View>
            </Pressable>
          );
        })}

        {askVertical ? (
          <FormGroup label="Rubro">
            <View className="flex-row flex-wrap gap-2">
              {activeVerticals.map((v) => (
                <Chip key={v.id} label={v.name} selected={draft.verticalId === v.id} onPress={() => patch({ verticalId: v.id })} />
              ))}
            </View>
          </FormGroup>
        ) : null}

        <Field
          label="Nombre"
          value={draft.name}
          onChangeText={(name) => patch({ name })}
          placeholder="Nombre de tu espacio"
          maxLength={80}
        />
      </ScreenScroll>
      <FooterBar>
        <Button size="lg" disabled={!valid} onPress={() => router.push({ pathname: '/edit-academy', params: { onboarding: '1' } })}>
          <Text className="text-[15.5px]">Continuar</Text>
        </Button>
      </FooterBar>
    </Screen>
  );
}
