import { cva, type VariantProps } from 'class-variance-authority';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, type PressableProps } from 'react-native';

import { PressScale } from '@/components/ui/press-scale';
import { TextClassContext } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const buttonVariants = cva('flex-row items-center justify-center gap-2', {
  variants: {
    variant: {
      default: 'bg-primary shadow-[0_1px_2px_var(--color-primary-glow),0_10px_24px_-6px_var(--color-primary-glow)]',
      dark: 'bg-ink shadow-[0_10px_24px_-8px_rgba(16,32,26,0.45)]',
      destructive: 'bg-destructive active:opacity-90',
      outline: 'border border-border bg-card active:bg-accent',
      secondary: 'border border-ink/[0.05] bg-card shadow-[0_1px_2px_rgba(16,32,26,0.05),0_8px_20px_-8px_rgba(16,32,26,0.10)] active:opacity-80',
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

/** Radio de cada tamaño (el degradado se dibuja encima del fondo y debe tener el mismo). */
const RADIUS = { default: 16, sm: 12, lg: 17, icon: 12 } as const;

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  const t = useTheme();
  const isDisabled = disabled || loading;
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <PressScale
        role="button"
        disabled={isDisabled}
        scale={variant === 'link' || variant === 'ghost' ? 1 : 0.97}
        className={cn(buttonVariants({ variant, size }), isDisabled && 'opacity-50', className)}
        {...props}
      >
        {(!variant || variant === 'default') && !isDisabled ? (
          <LinearGradient
            pointerEvents="none"
            colors={[t.primaryLight, t.primary, t.primaryDark]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS[size ?? 'default'], opacity: 0.55 }}
          />
        ) : null}
        {loading ? <ActivityIndicator /> : null}
        {children}
      </PressScale>
    </TextClassContext.Provider>
  );
}

export { buttonTextVariants, buttonVariants };
