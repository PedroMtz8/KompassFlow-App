import { TextInput } from 'react-native';

import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<typeof TextInput>;

export function Input({ className, editable, ...props }: InputProps) {
  return (
    <TextInput
      editable={editable}
      placeholderTextColorClassName="accent-subtle"
      className={cn(
        'h-12 rounded-[16px] border border-ink/[0.06] bg-card px-3.5 text-[15px] font-semibold text-foreground shadow-[0_1px_2px_rgba(16,32,26,0.04),0_8px_18px_-10px_rgba(16,32,26,0.12)] focus:border-primary',
        editable === false && 'opacity-50',
        className
      )}
      {...props}
    />
  );
}
