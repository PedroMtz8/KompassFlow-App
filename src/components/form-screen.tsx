import { ActivityIndicator, Pressable, View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FooterBar } from '@/components/ui/footer-bar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';

type FormScreenProps = {
  title: string;
  subtitle?: string;
  cta: string;
  onSubmit: () => void;
  /** Enlace de texto bajo el botón principal ("No es la misma persona"). */
  secondary?: { label: string; onPress: () => void };
  ctaVariant?: 'default' | 'dark' | 'destructive';
  children: React.ReactNode;
  back?: boolean;
  /** Deshabilita el botón principal (formulario incompleto o enviando). */
  disabled?: boolean;
  /** Muestra un indicador en el botón principal y lo bloquea mientras se guarda. */
  loading?: boolean;
};

/** Estructura común de formularios: encabezado, cuerpo desplazable y botón fijo abajo. */
export function FormScreen({
  title,
  subtitle,
  cta,
  onSubmit,
  secondary,
  ctaVariant = 'default',
  children,
  back = true,
  disabled,
  loading,
}: FormScreenProps) {
  // Los botones que dicen «Guardando…», «Creando…» muestran el indicador y se bloquean solos.
  const busy = loading ?? /(…|\.\.\.)$/.test(cta);
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} back={back} />
      <ScreenScroll contentContainerClassName="gap-3" keyboardShouldPersistTaps="handled">
        {children}
      </ScreenScroll>
      <FooterBar className="gap-2.5">
        <Button size="lg" variant={ctaVariant} onPress={onSubmit} disabled={disabled || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : null}
          <Text className="text-[15.5px]">{cta}</Text>
        </Button>
        {secondary ? (
          <Pressable onPress={secondary.onPress} className="items-center py-1">
            <Text className="text-[13px] font-bold text-muted-foreground">{secondary.label}</Text>
          </Pressable>
        ) : null}
      </FooterBar>
    </Screen>
  );
}

/** Grupo de chips con etiqueta, para formularios. */
export function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}
