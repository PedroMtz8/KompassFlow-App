import { Globe } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { FormGroup } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { deviceTimeZone, differsFromDevice, gmtLabel, MX_ZONES, suggestedZone, zoneName } from '@/lib/timezone';

/**
 * Zona horaria de la academia. Es la que manda: las clases se programan y se muestran en esta hora para todos. Se compara
 * con la del dispositivo para avisar cuando son distintas (por ejemplo, al programar viajando).
 */
export function TimeZoneField({
  value,
  onChange,
  disabled,
  note,
}: {
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
  note?: string;
}) {
  const t = useTheme();
  const device = deviceTimeZone();
  const listed = MX_ZONES.some((z) => z.id === value);
  const mismatch = differsFromDevice(value);

  return (
    <FormGroup label="ZONA HORARIA DE LA ACADEMIA">
      <View className="flex-row flex-wrap gap-2">
        {MX_ZONES.map((z) => (
          <Chip key={z.id} label={`${z.label} · ${gmtLabel(z.id)}`} selected={value === z.id} onPress={() => !disabled && onChange(z.id)} />
        ))}
        {!listed ? <Chip label={`${zoneName(value)} · ${gmtLabel(value)}`} selected onPress={() => {}} /> : null}
      </View>
      <Text variant="muted" className="text-xs">
        {MX_ZONES.find((z) => z.id === value)?.note ?? 'Todas las clases se programan y se muestran en esta hora.'}
      </Text>
      <View className={`flex-row items-start gap-2.5 rounded-[18px] px-3.5 py-3 ${mismatch ? 'bg-amber-soft' : 'bg-muted'}`}>
        <Icon as={Globe} size={16} color={mismatch ? t.amberDark : t.mutedForeground} />
        <View className="flex-1 gap-1.5">
          <Text className={`text-xs leading-[17px] ${mismatch ? 'text-amber-ink' : 'text-muted-foreground'}`}>
            Tu dispositivo está en {zoneName(device)} ({gmtLabel(device)}).{' '}
            {mismatch
              ? 'Es distinta a la de tu academia: las clases siempre se programan en la hora de la academia, y a los alumnos se les avisa si su hora local difiere.'
              : 'Coincide con la de tu academia.'}
          </Text>
          {mismatch && !disabled ? (
            <Pressable onPress={() => onChange(suggestedZone())} className="self-start active:opacity-70">
              <Text className="text-xs font-bold text-primary">Usar la zona de mi dispositivo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {note ? (
        <Text variant="muted" className="text-xs">
          {note}
        </Text>
      ) : null}
    </FormGroup>
  );
}
