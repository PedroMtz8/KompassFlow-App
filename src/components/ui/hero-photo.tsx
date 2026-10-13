import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Photo } from '@/components/ui/photo';

type HeroPhotoProps = {
  uri: string;
  height: number;
  /** Botón a la derecha (compartir, favorito). */
  right?: React.ReactNode;
};

/** Botón translúcido sobre foto. */
export function GlassButton({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="h-[38px] w-[38px] items-center justify-center rounded-xl bg-white/90 active:opacity-80">
      {children}
    </Pressable>
  );
}

/** Foto de cabecera que se funde con el fondo crema; incluye botón de volver. */
export function HeroPhoto({ uri, height, right }: HeroPhotoProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ height }}>
      <Photo uri={uri} height={height} style={{ position: 'absolute', inset: 0 }} />
      <LinearGradient
        colors={['rgba(27,22,32,0.5)', 'rgba(27,22,32,0)', 'rgba(255,247,241,0.95)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View
        className="mx-auto w-full max-w-[480px] md:max-w-[680px] flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 4 }}
      >
        <GlassButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Icon as={ChevronLeft} size={19} />
        </GlassButton>
        {right}
      </View>
    </View>
  );
}
