import { Globe } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { clock, deviceTimeZone, differsFromDevice, gmtLabel, zoneName } from '@/lib/timezone';

/**
 * Aviso en pantallas de la academia: los horarios se muestran y se programan en la hora de la academia; si el dispositivo
 * está en otra zona se dice con claridad, para no confundirse al programar clases desde otro estado.
 */
export function TimeZoneBanner({ tz }: { tz: string }) {
  const t = useTheme();
  if (!differsFromDevice(tz)) return null;
  const device = deviceTimeZone();
  return (
    <View className="flex-row items-start gap-2.5 rounded-[18px] bg-amber-soft px-3.5 py-3">
      <Icon as={Globe} size={16} color={t.amberDark} />
      <Text className="flex-1 text-xs leading-[17px] text-amber-ink">
        Los horarios son en la hora de tu academia:{' '}
        <Text className="text-xs font-bold text-amber-ink">
          {zoneName(tz)} ({gmtLabel(tz)})
        </Text>
        . Tu dispositivo está en {zoneName(device)} ({gmtLabel(device)}), así que su reloj marca otra hora.
      </Text>
    </View>
  );
}

/** Para el alumno: la hora de una clase en la zona de la academia y, si difiere, qué hora sería en la suya. */
export function TimeZoneNote({ at, tz }: { at: number | string | Date; tz: string }) {
  const when = new Date(at).getTime();
  if (!differsFromDevice(tz, when)) return null;
  const device = deviceTimeZone();
  return (
    <Text className="text-[11.5px] leading-[16px] text-muted-foreground">
      Hora de la academia ({gmtLabel(tz, when)}). En tu zona ({gmtLabel(device, when)}) serían las {clock(when, device)}.
    </Text>
  );
}
