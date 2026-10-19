import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import { ActivityIndicator, Platform, Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/lib/theme';

/** Botón de recargar para web de escritorio, donde no se puede jalar hacia abajo. En el celular no se muestra. */
export function RefreshButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const t = useTheme();
  if (Platform.OS !== 'web') return null;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityLabel="Actualizar"
      className="h-10 w-10 items-center justify-center rounded-xl bg-card active:opacity-80"
    >
      {busy ? <ActivityIndicator color={t.primary} /> : <Icon as={RefreshCw} size={17} />}
    </Pressable>
  );
}
