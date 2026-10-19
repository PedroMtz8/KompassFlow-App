import { router } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
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

/** Botón cuadrado blanco de 40 px (volver, cerrar, acciones). */
export function IconButton({ children, onPress, className }: { children: React.ReactNode; onPress?: () => void; className?: string }) {
  return (
    <PressScale
      onPress={onPress}
      scale={0.92}
      className={cn(
        'h-[40px] w-[40px] items-center justify-center rounded-[14px] border border-ink/[0.05] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.05),0_6px_14px_-4px_rgba(16,32,26,0.10)]',
        className
      )}
    >
      {children}
    </PressScale>
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
        <Text className="text-[20px] font-extrabold tracking-[-0.03em]" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
