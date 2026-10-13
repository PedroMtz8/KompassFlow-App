import { View } from 'react-native';

import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FieldProps = InputProps & { label: string; containerClassName?: string };

/** Etiqueta + campo de texto. */
export function Field({ label, containerClassName, ...props }: FieldProps) {
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      <Label>{label}</Label>
      <Input {...props} />
    </View>
  );
}
