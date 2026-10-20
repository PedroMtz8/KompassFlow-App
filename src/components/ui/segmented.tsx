import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type Option<T extends string> = { value: T; label: string };

const PAD = 4;

/** Selector de pestañas en forma de píldora (Clases | Academias | Mapa): el fondo blanco se desliza hasta la opción elegida. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const cell = width > 0 ? (width - PAD * 2) / options.length : 0;
  // Solo el desplazamiento se anima. El ancho va fijo en el estilo: si Reanimated lo pone después de montar, la vista nace con
  // ancho 0 y la sombra con esquinas redondeadas produce NaN en iOS (errores de CoreGraphics).
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(index * cell, { damping: 20, stiffness: 260, mass: 0.7 }) }],
  }));
  return (
    <View className="flex-row rounded-[18px] bg-ink/[0.06] p-1" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute rounded-[14px] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.08),0_6px_12px_-4px_rgba(16,32,26,0.14)]"
          style={[{ top: PAD, bottom: PAD, left: PAD, width: cell }, thumb]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} className="flex-1 items-center rounded-[14px] py-2.5">
            <Text className={cn('text-[13px] font-bold', on ? 'text-foreground' : 'text-muted-foreground')}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
