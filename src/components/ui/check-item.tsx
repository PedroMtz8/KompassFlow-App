import { Check, Minus, X } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// Positivo siempre en verde, sin depender del tema (en el tema «verde» el terciario es naranja y se leería como alerta).
const GREEN = '#1E9E5A';
const GREEN_DARK = '#13703F';

type CheckItemProps = {
  label: string;
  /** ok = verde con palomita; warn = ámbar pendiente; off = gris deshabilitado. */
  state?: 'ok' | 'warn' | 'off';
  /** Forma del marcador: círculo (verificación) o cuadro redondeado (lista de permisos). */
  shape?: 'circle' | 'square';
  textClassName?: string;
};

export function CheckItem({ label, state = 'ok', shape = 'circle', textClassName }: CheckItemProps) {
  const t = useTheme();
  const bg = { ok: GREEN, warn: t.amber, off: t.border };
  const fg = { ok: GREEN_DARK, warn: t.amberDark, off: t.subtle };
  const glyph = state === 'ok' ? Check : state === 'warn' ? Minus : X;
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={cn('h-5 w-5 items-center justify-center', shape === 'circle' ? 'rounded-full' : 'rounded-[7px]')}
        style={{ backgroundColor: bg[state] }}
      >
        <Icon as={glyph} size={12} color={state === 'off' ? t.subtle : '#fff'} strokeWidth={3} />
      </View>
      <Text className={cn('text-[13px] font-semibold', textClassName)} style={textClassName ? undefined : { color: fg[state] }}>
        {label}
      </Text>
    </View>
  );
}
