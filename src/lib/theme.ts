import { useMemo } from 'react';
import { useCSSVariable } from 'uniwind';

/**
 * Colores del tema activo, leídos de las variables de `src/global.css` (ver `src/theme/*.css`). Las clases de Tailwind ya
 * siguen al tema solas; este hook es para lo que NO se puede escribir como clase: íconos, degradados, gráficas, mapas…
 *
 * Los «puestos» son tres: primario, secundario (variables `violet-*`) y terciario (variables `teal-*`); sus nombres son
 * los de los puestos, no los de los colores que tengan en cada tema.
 */
const NAMES = [
  '--color-background',
  '--color-foreground',
  '--color-card',
  '--color-muted',
  '--color-muted-foreground',
  '--color-subtle',
  '--color-border',
  '--color-primary',
  '--color-primary-dark',
  '--color-primary-soft',
  '--color-primary-light',
  '--color-primary-ink',
  '--color-violet',
  '--color-violet-dark',
  '--color-violet-soft',
  '--color-violet-light',
  '--color-violet-ink',
  '--color-teal',
  '--color-teal-dark',
  '--color-teal-soft',
  '--color-teal-light',
  '--color-teal-ink',
  '--color-amber',
  '--color-amber-dark',
  '--color-amber-soft',
  '--color-amber-light',
  '--color-amber-ink',
] as const;

/** Respaldo (tema naranja) por si una variable aún no está disponible en el primer render. */
const FALLBACK: Record<(typeof NAMES)[number], string> = {
  '--color-background': '#fff7f1',
  '--color-foreground': '#1b1620',
  '--color-card': '#ffffff',
  '--color-muted': '#f3eef4',
  '--color-muted-foreground': '#6b6270',
  '--color-subtle': '#9a93a0',
  '--color-border': '#ede7ee',
  '--color-primary': '#e4572e',
  '--color-primary-dark': '#c2431f',
  '--color-primary-soft': '#ffe8df',
  '--color-primary-light': '#ff8a3d',
  '--color-primary-ink': '#5c2410',
  '--color-violet': '#6e4be8',
  '--color-violet-dark': '#5536c4',
  '--color-violet-soft': '#eeeaf8',
  '--color-violet-light': '#a88bff',
  '--color-violet-ink': '#2e1f5e',
  '--color-teal': '#00947e',
  '--color-teal-dark': '#00745f',
  '--color-teal-soft': '#e3f3ef',
  '--color-teal-light': '#43c9ac',
  '--color-teal-ink': '#0b3f36',
  '--color-amber': '#ffb020',
  '--color-amber-dark': '#8a5a00',
  '--color-amber-soft': '#fff1d6',
  '--color-amber-light': '#ffc531',
  '--color-amber-ink': '#5c3d00',
};

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  subtle: string;
  border: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryLight: string;
  primaryInk: string;
  violet: string;
  violetDark: string;
  violetSoft: string;
  violetLight: string;
  violetInk: string;
  teal: string;
  tealDark: string;
  tealSoft: string;
  tealLight: string;
  tealInk: string;
  amber: string;
  amberDark: string;
  amberSoft: string;
  amberLight: string;
  amberInk: string;
};

const camel = (n: string) => n.replace('--color-', '').replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

export function useTheme(): ThemeColors {
  const values = useCSSVariable([...NAMES]);
  return useMemo(() => {
    const out: Record<string, string> = {};
    NAMES.forEach((n, i) => {
      const v = values[i];
      out[camel(n)] = typeof v === 'string' && v.trim() ? v.trim() : FALLBACK[n];
    });
    return out as ThemeColors;
  }, [values]);
}

/** El mismo color con transparencia (`alpha` de 0 a 1). Acepta #rgb, #rrggbb o rgb(...). */
export function withAlpha(color: string, alpha: number) {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)/i);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Tono de la barra `i` de `n` en una gráfica: más intenso mientras más reciente (de claro a primario). */
export function barShade(t: ThemeColors, i: number, n: number) {
  const r = i / Math.max(n - 1, 1);
  return r > 0.85 ? t.primary : r > 0.7 ? t.primaryLight : r > 0.4 ? withAlpha(t.primary, 0.4) : withAlpha(t.primary, 0.22);
}
