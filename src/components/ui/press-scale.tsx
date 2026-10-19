import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = PressableProps & {
  className?: string;
  /** Escala al presionar (1 = sin efecto). */
  scale?: number;
};

/** Pressable que se hunde un poco al tocarlo (resorte corto): la respuesta táctil de botones, tarjetas y filas. */
export function PressScale({ scale = 0.97, onPressIn, onPressOut, style, ...props }: PressScaleProps) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        s.set(withSpring(scale, { damping: 18, stiffness: 420, mass: 0.6 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, { damping: 14, stiffness: 300, mass: 0.6 }));
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? undefined : style, anim]}
    />
  );
}
