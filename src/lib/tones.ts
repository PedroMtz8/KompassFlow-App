import { useMemo } from 'react';

import { useTheme } from './theme';

/** Tonos de marca de KompassFlow: cada academia/estado usa uno (mosaicos, barras, etiquetas). */
export type Tone = 'orange' | 'violet' | 'teal' | 'amber' | 'pink' | 'blue' | 'green' | 'ink';

export type ToneSpec = {
  /** Color sólido (puntos, iconos, bordes). */
  solid: string;
  /** Degradado de mosaicos y barras (de izquierda a derecha). */
  gradient: readonly [string, string];
  /** Fondo suave para etiquetas y tarjetas tintadas. */
  soft: string;
  /** Texto legible sobre `soft`. */
  deep: string;
  /** Texto de mayor contraste sobre `soft` (títulos de tarjetas tintadas). */
  ink: string;
};

/** Tonos fijos (no cambian con el tema): se usan para variar el color de academias y gráficas. «green» = estado positivo en cualquier tema. */
const FIXED = {
  pink: { solid: '#E83E80', gradient: ['#E83E80', '#FF8FB5'], soft: '#FFE3EE', deep: '#C2185B', ink: '#5C0F2E' },
  green: { solid: '#1E9E5A', gradient: ['#1E9E5A', '#6CCB95'], soft: '#E0F5E9', deep: '#13703F', ink: '#0A3B22' },
  blue: { solid: '#0077C8', gradient: ['#0077C8', '#5BB4F0'], soft: '#E1F0FA', deep: '#005A99', ink: '#0B2F4D' },
} as const satisfies Record<string, ToneSpec>;

/**
 * Tonos del tema activo. «orange» = el color PRIMARIO del tema, «violet» = el SECUNDARIO y «teal» = el TERCIARIO (son
 * nombres de puesto: con el tema violeta, «orange» es violeta). Se eligen en `src/global.css`.
 */
export function useTones(): Record<Tone, ToneSpec> {
  const t = useTheme();
  return useMemo(
    () => ({
      orange: { solid: t.primary, gradient: [t.primary, t.primaryLight], soft: t.primarySoft, deep: t.primaryDark, ink: t.primaryInk },
      violet: { solid: t.violet, gradient: [t.violet, t.violetLight], soft: t.violetSoft, deep: t.violetDark, ink: t.violetInk },
      teal: { solid: t.teal, gradient: [t.teal, t.tealLight], soft: t.tealSoft, deep: t.tealDark, ink: t.tealInk },
      amber: { solid: t.amber, gradient: [t.amber, t.amberLight], soft: t.amberSoft, deep: t.amberDark, ink: t.amberInk },
      pink: FIXED.pink,
      green: FIXED.green,
      blue: FIXED.blue,
      ink: { solid: t.foreground, gradient: [t.foreground, '#4A4152'], soft: t.muted, deep: t.foreground, ink: t.foreground },
    }),
    [t],
  );
}

/** Sombra suave de tarjetas blancas sobre el fondo crema. */
export const cardShadow = '0 6px 20px rgba(27,22,32,0.06)';
