import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, withAlpha } from '@/lib/theme';
import { Photo } from '@/components/ui/photo';
import { Text } from '@/components/ui/text';
import { photos } from '@/mocks/photos';
import { BrandMark } from '@/components/brand-mark';

type AuthShellProps = { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode };

/** Marco de las pantallas de acceso: foto con logo, título, contenido y enlace inferior. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow"
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-auto w-full max-w-[480px] md:max-w-[680px] flex-1">
          <View className="h-[230px]">
            <Photo uri={photos.hero} height={230} style={{ position: 'absolute', inset: 0 }} />
            <LinearGradient
              colors={['rgba(27,22,32,0.45)', 'rgba(27,22,32,0)', withAlpha(t.background, 0), t.background]}
              locations={[0, 0.35, 0.6, 1]}
              style={{ position: 'absolute', inset: 0 }}
            />
            <View className="flex-row items-center gap-[9px] px-6" style={{ paddingTop: insets.top + 12 }}>
              <BrandMark size={30} />
              <Text className="text-xl font-extrabold tracking-[-0.025em] text-white">KompassFlow</Text>
            </View>
          </View>

          <View className="-mt-6 gap-5 px-6">
            <View className="gap-1.5">
              <Text variant="h1">{title}</Text>
              <Text variant="lead">{subtitle}</Text>
            </View>
            {children}
          </View>

          <View className="flex-1 items-center justify-end px-6 pt-5" style={{ paddingBottom: Math.max(insets.bottom, 16) + 18 }}>
            {footer}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Separador "o" entre el formulario y el acceso social. */
export function OrDivider() {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Text variant="muted">o</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
