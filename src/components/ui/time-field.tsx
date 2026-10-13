import { Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  label?: string;
  /** "HH:MM" en 24 h. */
  value: string;
  onChange: (v: string) => void;
  /** Paso de los minutos (5 por defecto). */
  step?: number;
  disabled?: boolean;
  containerClassName?: string;
  className?: string;
};

function Cell({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('h-11 w-full items-center justify-center rounded-xl active:opacity-80', on ? 'bg-ink' : 'bg-muted')}
    >
      <Text className={cn('font-mono-bold text-[14px]', on && 'text-white')}>{label}</Text>
    </Pressable>
  );
}

/**
 * Campo de hora: en vez de escribir «19:00» a mano se elige la hora y los minutos en una hoja inferior.
 * Así nunca queda una hora inválida y funciona igual en iOS, Android y web.
 */
export function TimeField({ label, value, onChange, step = 5, disabled, containerClassName, className }: Props) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  const hour = Number.isNaN(h) ? 19 : h;
  const minute = Number.isNaN(m) ? 0 : m;
  const [draft, setDraft] = useState({ hour, minute });
  const minutes = Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);

  const show = () => {
    // Si la hora actual no cae en el paso (por ejemplo 18:07), se acerca al minuto más cercano para mostrarlo seleccionado.
    setDraft({ hour, minute: minutes.reduce((a, b) => (Math.abs(b - minute) < Math.abs(a - minute) ? b : a), minutes[0]) });
    setOpen(true);
  };
  const apply = () => {
    onChange(`${pad(draft.hour)}:${pad(draft.minute)}`);
    setOpen(false);
  };

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? <Label>{label}</Label> : null}
      <Pressable
        onPress={show}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value}` : `Hora: ${value}`}
        className={cn(
          'h-12 flex-row items-center justify-between rounded-[14px] bg-card px-3.5 shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-80',
          disabled && 'opacity-50',
          className
        )}
      >
        <Text className="font-mono-bold text-[15px]">{`${pad(hour)}:${pad(minute)}`}</Text>
        <Icon as={Clock} size={17} color="#6B6270" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          {/* Un toque dentro de la hoja no la cierra. */}
          <Pressable onPress={() => {}} className="mx-auto w-full max-w-[520px] gap-3 rounded-t-[28px] bg-background px-5 pb-8 pt-5">
            <View className="flex-row items-center justify-between">
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text className="text-[15px] font-bold text-muted-foreground">Cancelar</Text>
              </Pressable>
              <Text className="font-mono-bold text-[26px] tracking-[-0.02em]">{`${pad(draft.hour)}:${pad(draft.minute)}`}</Text>
              <Pressable onPress={apply} hitSlop={10}>
                <Text className="text-[15px] font-extrabold text-primary">Listo</Text>
              </Pressable>
            </View>
            <Text variant="overline">HORA</Text>
            <View className="flex-row flex-wrap gap-[1.4%]">
              {HOURS.map((x) => (
                <View key={x} className="w-[15.5%] pb-2">
                  <Cell label={pad(x)} on={draft.hour === x} onPress={() => setDraft((d) => ({ ...d, hour: x }))} />
                </View>
              ))}
            </View>
            <Text variant="overline">MINUTOS</Text>
            <View className="flex-row flex-wrap gap-[1.4%]">
              {minutes.map((x) => (
                <View key={x} className="w-[15.5%] pb-2">
                  <Cell label={pad(x)} on={draft.minute === x} onPress={() => setDraft((d) => ({ ...d, minute: x }))} />
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
