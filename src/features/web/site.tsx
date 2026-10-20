import { router } from 'expo-router';
import Music from 'lucide-react-native/icons/music';
import type { MouseEvent, ReactNode } from 'react';

import { INK, PAPER } from './colors';

/** Piezas comunes de las páginas web públicas (landing y páginas legales). Solo se importan desde archivos `.web.tsx`. */

export { INK, PAPER };

export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

/** Enlace HTML real (clic derecho, abrir en pestaña nueva…) que navega sin recargar la página. */
export function A({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(href as never);
  };
  return (
    <a href={href} onClick={onClick} className={className} style={style}>
      {children}
    </a>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary">
        <Music size={17} color="#fff" strokeWidth={2.4} />
      </span>
      <span className="font-extrabold text-[21px] tracking-[-0.035em]" style={{ color: light ? '#fff' : INK }}>
        KompassFlow
      </span>
    </span>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: `2px solid ${INK}` }}>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 py-9 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="text-[13.5px]" style={{ color: `${INK}99` }}>
            © {new Date().getFullYear()} KompassFlow. La agenda de las academias de baile.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[14.5px] font-bold" aria-label="Legal y contacto">
          <A href="/terms" className="kf-link">Términos</A>
          <A href="/privacy" className="kf-link">Privacidad</A>
          <A href="/support" className="kf-link">Soporte</A>
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="kf-link">
              {SUPPORT_EMAIL}
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}

