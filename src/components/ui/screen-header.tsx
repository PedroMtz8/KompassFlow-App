import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Muestra el botón de volver (por defecto sí). */
  back?: boolean;
  right?: React.ReactNode;
  className?: string;
};

/** Botón cuadrado blanco de 38 px (volver, cerrar, acciones). */
export function IconButton({ children, onPress, className }: { children: React.ReactNode; onPress?: () => void; className?: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'h-[38px] w-[38px] items-center justify-center rounded-xl bg-card shadow-[0_3px_10px_rgba(27,22,32,0.07)] active:opacity-80',
        className
      )}
    >
      {children}
    </Pressable>
  );
}

export function ScreenHeader({ title, subtitle, back = true, right, className }: ScreenHeaderProps) {
  return (
    <View className={cn('mx-auto w-full max-w-[480px] md:max-w-[680px] flex-row items-center gap-3 px-5 pb-3.5 pt-1', className)}>
      {back ? (
        <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Icon as={ChevronLeft} size={19} />
        </IconButton>
      ) : null}
      <View className="min-w-0 flex-1 gap-[3px]">
        <Text className="text-[19px] font-extrabold tracking-[-0.02em]" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
