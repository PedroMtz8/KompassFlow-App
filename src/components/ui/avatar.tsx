import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

import { useTheme } from '@/lib/theme';

type AvatarProps = {
  uri?: string | null;
  /** Nombre para mostrar iniciales cuando no hay foto. */
  name?: string;
  size?: number;
  /** Radio en px; por defecto círculo. Las academias usan esquinas suaves (~30% del tamaño). */
  radius?: number;
  /** Borde de acento (usuario activo). */
  ring?: boolean;
};

const initialsOf = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export function Avatar({ uri, name, size = 40, radius, ring }: AvatarProps) {
  const t = useTheme();
  const style = {
    width: size,
    height: size,
    borderRadius: radius ?? size / 2,
    borderWidth: ring ? 2 : 0,
    borderColor: t.primary,
    backgroundColor: t.muted,
  };
  if (!uri) {
    return (
      <View className="items-center justify-center" style={style}>
        <Text className="font-extrabold text-muted-foreground" style={{ fontSize: Math.max(11, size * 0.32) }}>
          {initialsOf(name) || '?'}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri }} contentFit="cover" transition={150} style={style} />;
}
