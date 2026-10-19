import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, useContext } from 'react';
import { Text as RNText } from 'react-native';

import { cn } from '@/lib/utils';

const textVariants = cva('text-base font-normal text-foreground', {
  variants: {
    variant: {
      default: '',
      h1: 'text-[32px] font-extrabold leading-[34px] tracking-[-0.04em]',
      h2: 'text-2xl font-extrabold tracking-[-0.03em]',
      h3: 'text-xl font-extrabold tracking-[-0.02em]',
      h4: 'text-base font-extrabold',
      lead: 'text-[14.5px] text-muted-foreground',
      muted: 'text-[12.5px] text-muted-foreground',
      small: 'text-[13px] font-bold',
      /** Etiqueta de sección en mayúsculas: "SESIONES", "DONDE ENSEÑAS". */
      overline: 'font-mono text-[11px] uppercase tracking-[0.08em] text-subtle',
      /** Cifras y horas en JetBrains Mono. */
      mono: 'font-mono-bold text-[13.5px]',
    },
  },
  defaultVariants: { variant: 'default' },
});

/** Permite que un padre (p. ej. Button) defina el estilo de texto de sus hijos <Text>. */
export const TextClassContext = createContext<string | undefined>(undefined);

export type TextProps = React.ComponentProps<typeof RNText> & VariantProps<typeof textVariants>;

export function Text({ className, variant, ...props }: TextProps) {
  const inherited = useContext(TextClassContext);
  return <RNText className={cn(textVariants({ variant }), inherited, className)} {...props} />;
}
