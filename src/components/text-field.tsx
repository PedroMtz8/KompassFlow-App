import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';

type TextFieldProps<T extends FieldValues> = Omit<InputProps, 'value' | 'onChangeText' | 'onBlur'> & {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
};

/** Campo de formulario (label + input + error) conectado a react-hook-form. */
export function TextField<T extends FieldValues>({ control, name, label, ...inputProps }: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View className="gap-2">
          <Label>{label}</Label>
          <Input value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} {...inputProps} />
          {fieldState.error?.message ? <Text className="text-sm text-destructive">{fieldState.error.message}</Text> : null}
        </View>
      )}
    />
  );
}
