import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils';

/** Zona fija inferior con las acciones principales de la pantalla. */
export function FooterBar({ className, children }: { className?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={cn('mx-auto w-full max-w-[480px] md:max-w-[680px] px-5 pt-3', className)}
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
    >
      {children}
    </View>
  );
}
