import type { LucideIcon, LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { withUniwind } from 'uniwind';

import { cn } from '@/lib/utils';

type StyledIcon = ComponentType<LucideProps & { className?: string; colorClassName?: string }>;

// withUniwind crea un componente nuevo por icono: lo cacheamos para no recrearlo en cada render.
const cache = new Map<LucideIcon, StyledIcon>();

function getStyled(icon: LucideIcon): StyledIcon {
  let styled = cache.get(icon);
  if (!styled) {
    styled = withUniwind(icon) as unknown as StyledIcon;
    cache.set(icon, styled);
  }
  return styled;
}

export type IconProps = LucideProps & {
  as: LucideIcon;
  className?: string;
  /** Clase de color, p. ej. "accent-primary". Por defecto usa el color de texto. */
  colorClassName?: string;
};

/** Icono de lucide con soporte de `className` (Uniwind):  <Icon as={Home} colorClassName="accent-primary" /> */
export function Icon({ as, className, colorClassName, size = 20, ...props }: IconProps) {
  const Styled = getStyled(as);
  // Con `color` explícito no se pasa `colorClassName` (Uniwind rechaza valores undefined).
  const colorProps = props.color ? {} : { colorClassName: cn('accent-foreground', colorClassName) };
  const classProps = className ? { className } : {};
  // El componente envuelto se cachea por icono (identidad estable): no se recrea en cada render.
  // eslint-disable-next-line react-hooks/static-components
  return <Styled size={size} {...classProps} {...colorProps} {...props} />;
}
