import { TextInput } from 'react-native';

import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<typeof TextInput>;

export function Input({ className, editable, ...props }: InputProps) {
  return (
    <TextInput
      editable={editable}
      placeholderTextColorClassName="accent-subtle"
      className={cn(
        'h-12 rounded-[14px] bg-card px-3.5 text-[15px] font-semibold text-foreground shadow-[0_6px_20px_rgba(27,22,32,0.06)]',
        editable === false && 'opacity-50',
        className
      )}
      {...props}
    />
  );
}
