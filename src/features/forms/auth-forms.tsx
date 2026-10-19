import { router } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { FormGroup } from '@/components/form-screen';
import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { done } from '@/lib/simulate';
import { useTones } from '@/lib/tones';
import { cn } from '@/lib/utils';
import { useCatalog, useMyInterests, useSaveInterests } from '@/features/interests/queries';

/**
 * Onboarding de intereses (US-17). Paso 1 (rubros) solo aparece si hay más de un rubro activo;
 * hoy solo Baile está activo, así que se asigna por defecto y se pasa directo a las disciplinas.
 * Nunca bloquea: se puede omitir.
 */
export function InterestsScreen() {
  const t = useTheme();
  const tones = useTones();
  const catalog = useCatalog();
  const mine = useMyInterests();
  const save = useSaveInterests();
  const [step, setStep] = useState<'verticals' | 'disciplines'>('verticals');
  const [verticals, setVerticals] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const palette = ['orange', 'violet', 'teal', 'amber', 'pink', 'blue'] as const;

  if (catalog.isPending || mine.isPending) {
    return (
      <Screen>
        <ScreenHeader title="¿Qué te interesa?" back={false} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (catalog.isError || mine.isError) {
    return (
      <Screen>
        <ScreenHeader title="¿Qué te interesa?" back={false} />
        <ScreenScroll>
          <Text variant="muted">No pudimos cargar las opciones.</Text>
          <Button variant="secondary" onPress={() => (catalog.refetch(), mine.refetch())}>
            <Text className="text-sm font-bold">Reintentar</Text>
          </Button>
          <Pressable onPress={() => router.replace('/discover')} className="items-center py-1">
            <Text className="text-[13px] font-bold text-muted-foreground">Omitir por ahora</Text>
          </Pressable>
        </ScreenScroll>
      </Screen>
    );
  }

  const active = catalog.data.filter((v) => v.isActive);
  const upcoming = catalog.data.filter((v) => !v.isActive);
  const multiVertical = active.length > 1;
  const selectedVerticals = verticals ?? mine.data.verticalIds;
  const selectedDisciplines = picked ?? mine.data.disciplineIds;
  const currentStep = multiVertical ? step : 'disciplines';
  const shown = multiVertical ? active.filter((v) => selectedVerticals.includes(v.id)) : active;

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const finish = () =>
    save.mutate(
      { verticalIds: selectedVerticals, disciplineIds: selectedDisciplines },
      { onSuccess: () => done('Intereses guardados', () => router.replace('/discover')) }
    );

  return (
    <Screen>
      <ScreenHeader
        title="¿Qué te interesa?"
        subtitle={currentStep === 'verticals' ? 'Elige lo que quieres encontrar' : 'Personalizamos Descubrir con tus gustos'}
        back={false}
      />
      <ScreenScroll contentContainerClassName="gap-4">
        {currentStep === 'verticals' ? (
          <>
            <FormGroup label="RUBROS">
              <View className="flex-row flex-wrap gap-2.5">
                {active.map((v) => {
                  const on = selectedVerticals.includes(v.id);
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVerticals(toggle(selectedVerticals, v.id))}
                      className={cn(
                        'flex-row items-center gap-1.5 rounded-2xl border-2 bg-card px-4 py-3',
                        on ? 'border-primary' : 'border-transparent'
                      )}
                    >
                      {on ? <Icon as={Check} size={15} color={t.primary} strokeWidth={3} /> : null}
                      <Text className="text-sm font-bold">{v.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormGroup>
          </>
        ) : (
          shown.map((v) => (
            <FormGroup key={v.id} label={v.name.toUpperCase()}>
              <View className="flex-row flex-wrap gap-2.5">
                {v.disciplines.map((d, i) => {
                  const on = selectedDisciplines.includes(d.id);
                  const t = tones[palette[i % palette.length]];
                  return (
                    <Pressable
                      key={d.id}
                      onPress={() => setPicked(toggle(selectedDisciplines, d.id))}
                      className={cn(
                        'flex-row items-center gap-1.5 rounded-2xl border-2 px-3.5 py-2.5 active:opacity-80',
                        on ? 'bg-card' : 'border-transparent bg-card'
                      )}
                      style={on ? { borderColor: t.solid } : undefined}
                    >
                      {on ? <Icon as={Check} size={15} color={t.solid} strokeWidth={3} /> : null}
                      <Text className="text-sm font-bold" style={on ? { color: t.deep } : undefined}>
                        {d.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormGroup>
          ))
        )}
        {upcoming.length ? (
          <FormGroup label="PRÓXIMAMENTE">
            <View className="flex-row flex-wrap gap-2">
              {upcoming.map((v) => (
                <View key={v.id} className="rounded-full bg-muted px-3.5 py-2 opacity-70">
                  <Text className="text-[13px] font-bold text-muted-foreground">{v.name}</Text>
                </View>
              ))}
            </View>
          </FormGroup>
        ) : null}
        <Text variant="muted" className="text-xs">
          Puedes cambiarlos cuando quieras desde tu perfil. No limitan lo que puedes reservar.
        </Text>
      </ScreenScroll>
      <FooterBar className="gap-2.5">
        {currentStep === 'verticals' ? (
          <Button size="lg" disabled={!selectedVerticals.length} onPress={() => setStep('disciplines')}>
            <Text className="text-[15.5px]">Continuar</Text>
          </Button>
        ) : (
          <Button size="lg" loading={save.isPending} onPress={finish}>
            <Text className="text-[15.5px]">{selectedDisciplines.length ? `Continuar · ${selectedDisciplines.length}` : 'Continuar'}</Text>
          </Button>
        )}
        <Pressable onPress={() => router.replace('/discover')} className="items-center py-1">
          <Text className="text-[13px] font-bold text-muted-foreground">Omitir por ahora</Text>
        </Pressable>
      </FooterBar>
    </Screen>
  );
}
