import { useId } from 'react';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Logo de Kompass: K con brazos en onda (mismo dibujo que el icono de la app, en `assets/images`). */
export function BrandMark({ size = 30 }: { size?: number }) {
  const id = `kf-mark-${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#00a88f" />
          <Stop offset="1" stopColor="#00745f" />
        </LinearGradient>
      </Defs>
      <Rect width={1024} height={1024} rx={230} fill={`url(#${id})`} />
      <Line x1={316} y1={262} x2={316} y2={762} stroke="#F5EFE3" strokeWidth={112} strokeLinecap="round" />
      <Path d="M411 505 C 546 470, 546 300, 708 268" stroke="#F5EFE3" strokeWidth={104} strokeLinecap="round" fill="none" />
      <Path d="M426 520 C 556 560, 576 730, 716 762" stroke="#e4572e" strokeWidth={96} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
