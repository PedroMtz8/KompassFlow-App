import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import type { Tone } from '@/lib/tones';

type IconTileProps = {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  /** `glass` = fondo blanco translúcido sobre tarjetas degradadas. */
  glass?: boolean;
};

/** Mosaico de color con icono sólido (32–44 px). */
export function IconTile({ icon, tone = 'orange', size = 32, glass }: IconTileProps) {
  const iconSize = Math.round(size * 0.5);
  const radius = Math.round(size * 0.375);
  const content = <Icon as={icon} size={iconSize} color="#fff" strokeWidth={2} />;
  if (glass) {
    return (
      <View
        className="items-center justify-center"
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.25)' }}
      >
        {content}
      </View>
    );
  }
  return (
    <Gradient tone={tone} style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
      {content}
    </Gradient>
  );
}
