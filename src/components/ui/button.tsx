import { cva, type VariantProps } from 'class-variance-authority';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const buttonVariants = cva('flex-row items-center justify-center gap-2', {
  variants: {
    variant: {
      default: 'bg-primary shadow-[0_8px_20px_var(--color-primary-glow)] active:opacity-90',
      dark: 'bg-ink active:opacity-90',
      destructive: 'bg-destructive active:opacity-90',
      outline: 'border border-border bg-card active:bg-accent',
      secondary: 'bg-card shadow-[0_6px_20px_rgba(27,22,32,0.06)] active:opacity-80',
      soft: 'bg-primary-soft active:opacity-80',
      ghost: 'active:bg-accent',
      link: '',
    },
    size: {
      default: 'h-[52px] rounded-2xl px-5',
      sm: 'h-10 rounded-xl px-3.5',
      lg: 'h-[54px] rounded-[17px] px-8',
      icon: 'h-[38px] w-[38px] rounded-xl',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

const buttonTextVariants = cva('text-[15px] font-extrabold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      dark: 'text-white',
      destructive: 'text-white',
      outline: 'text-foreground',
      secondary: 'text-foreground',
      soft: 'text-primary-dark',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type ButtonProps = Omit<PressableProps, 'children'> &
  VariantProps<typeof buttonVariants> & {
    children?: React.ReactNode;
    loading?: boolean;
    className?: string;
  };

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <Pressable
        role="button"
        disabled={isDisabled}
        className={cn(buttonVariants({ variant, size }), isDisabled && 'opacity-50', className)}
        {...props}
      >
        {loading ? <ActivityIndicator /> : null}
        {children}
      </Pressable>
    </TextClassContext.Provider>
  );
}

export { buttonTextVariants, buttonVariants };
