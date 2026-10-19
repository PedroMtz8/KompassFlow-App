import MapPin from 'lucide-react-native/icons/map-pin';
import { Pressable, View } from 'react-native';

import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Tone } from '@/lib/tones';

type Pin = { label: string; tone: Tone; left: number; top: number };

type MapPreviewProps = { pins: Pin[]; onOpen?: () => void; height?: number };

/** Mapa ilustrado (mock) con pines por academia; el mapa real llega con la integración de ubicación. */
export function MapPreview({ pins, onOpen, height = 150 }: MapPreviewProps) {
  return (
    <View className="overflow-hidden rounded-3xl bg-[#F1E9DF]" style={{ height }}>
      <View className="absolute -left-5 -right-5 top-[58px] h-2.5 bg-white" style={{ transform: [{ rotate: '-8deg' }] }} />
      <View className="absolute -bottom-5 -top-5 left-[120px] w-[9px] bg-white" style={{ transform: [{ rotate: '14deg' }] }} />
      <View className="absolute -bottom-5 -top-5 left-[268px] w-[7px] bg-white" />
      <View className="absolute -left-5 -right-5 top-[118px] h-1.5 bg-white" />
      <View className="absolute left-[170px] top-[78px] h-[34px] w-[62px] rounded-xl bg-[#DDEFD8]" />
      {pins.map((p) => (
        <View
          key={p.label}
          className="absolute flex-row items-center gap-[5px] rounded-full bg-white py-[5px] pl-[5px] pr-[9px]"
          style={{ left: p.left, top: p.top }}
        >
          <Gradient tone={p.tone} style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={MapPin} size={10} color="#fff" />
          </Gradient>
          <Text className="text-[11.5px] font-extrabold">{p.label}</Text>
        </View>
      ))}
      {onOpen ? (
        <Pressable onPress={onOpen} className="absolute bottom-2.5 right-2.5 rounded-[10px] bg-ink px-2.5 py-[7px] active:opacity-80">
          <Text className="text-[11.5px] font-extrabold text-white">Ver mapa</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
