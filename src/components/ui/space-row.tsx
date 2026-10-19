import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Check from 'lucide-react-native/icons/check';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Gradient } from '@/components/ui/gradient';
import { Icon } from '@/components/ui/icon';
import { Photo } from '@/components/ui/photo';
import { Text } from '@/components/ui/text';
import type { Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

type SpaceRowProps = {
  name: string;
  badge: string;
  badgeTone: Tone;
  /** Solid = badge oscuro con texto blanco (PROPIETARIO). */
  badgeSolid?: boolean;
  detail: string;
  photo?: string;
  initials?: string;
  icon?: LucideIcon;
  active?: boolean;
  onPress?: () => void;
};

/** Fila de "Cambiar espacio": foto/mosaico + nombre + rol + estado. */
export function SpaceRow({ name, badge, badgeTone, badgeSolid, detail, photo, initials, icon, active, onPress }: SpaceRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-[20px] border-2 bg-card p-[11px] border border-ink/[0.045] shadow-[0_1px_2px_rgba(16,32,26,0.05),0_12px_28px_-8px_rgba(16,32,26,0.10)] active:opacity-80',
        active ? 'border-primary' : 'border-transparent'
      )}
    >
      {photo ? (
        <Photo uri={photo} width={46} height={46} radius={15} />
      ) : initials ? (
        <Gradient tone="ink" style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-base font-extrabold text-white">{initials}</Text>
        </Gradient>
      ) : (
        <View className="h-[46px] w-[46px] items-center justify-center rounded-[15px] bg-muted">
          {icon ? <Icon as={icon} size={20} /> : null}
        </View>
      )}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-[14.5px] font-bold" numberOfLines={1}>
          {name}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Badge tone={badgeTone} appearance={badgeSolid ? 'solid' : 'soft'}>
            {badge}
          </Badge>
          <Text className="text-[11.5px] text-muted-foreground">{detail}</Text>
        </View>
      </View>
      {active ? (
        <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={13} color="#fff" strokeWidth={3} />
        </View>
      ) : (
        <Icon as={ChevronRight} size={18} color="#9A93A0" />
      )}
    </Pressable>
  );
}
