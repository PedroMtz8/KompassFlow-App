import { Image } from 'expo-image';
import { StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

type PhotoProps = {
  uri: string;
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ImageStyle>;
};

/** Foto remota con esquinas redondeadas (mock: Unsplash). */
export function Photo({ uri, width = '100%', height, radius = 0, style }: PhotoProps) {
  return (
    <Image
      source={{ uri }}
      contentFit="cover"
      transition={150}
      style={StyleSheet.flatten([{ width, height, borderRadius: radius, backgroundColor: '#F3EEF4' }, style])}
    />
  );
}
