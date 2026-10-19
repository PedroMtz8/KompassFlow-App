import { router } from 'expo-router';
import Music from 'lucide-react-native/icons/music';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Entry } from '@/features/entry/entry';
import { photos } from '@/mocks/photos';

/**
 * Página de presentación (solo web). La ruta «/» es pública: sin sesión se ve esta página; con sesión se manda a la
 * persona al lado donde estaba (alumno o academia), igual que en el celular. Va con elementos HTML normales para
 * que se comporte como un sitio web: enlaces reales, secciones con ancla, texto seleccionable.
 *
 * Se renderiza en el servidor (el HTML ya trae todo el contenido, sin esperar a JavaScript ni a la sesión). Las animaciones
 * son solo del cliente: nada queda oculto hasta que JavaScript marca la página como «lista» (`kf-ready`).
 */
export default function Index() {
  return <Entry signedOut={<Landing />} pending={<Landing />} />;
}

/* ─────────────────────────────  colores propios de la página  ───────────────────────────── */
const PAPER = '#F5EFE3';
const INK = '#0D1D18';

const DISCIPLINES = ['Bachata', 'Salsa', 'Kizomba', 'Tango', 'Zouk', 'Danza urbana', 'Ballet', 'Folklore', 'Jazz', 'Contemporáneo', 'Cumbia', 'Hip hop'];

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

/** Enlace HTML real (clic derecho, abrir en pestaña nueva…) que navega sin recargar la página. */
function A({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: ReactNode }) {
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

function scrollToId(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

/** Aparece suave al entrar en pantalla (y no se anima si la persona pidió menos movimiento). */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('kf-in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('kf-in');
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`kf-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const CSS = `
.kf-root { font-family: HankenGrotesk_400Regular, system-ui, sans-serif; color: ${INK}; -webkit-font-smoothing: antialiased; }
@layer base { .kf-root a { color: inherit; text-decoration: none; } }
.kf-mono { font-family: JetBrainsMono_500Medium, ui-monospace, monospace; letter-spacing: 0.04em; text-transform: uppercase; }
.kf-ready .kf-reveal:not(.kf-in) { opacity: 0; transform: translateY(22px); }
.kf-reveal {  transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
@keyframes kf-marquee { to { transform: translateX(-50%); } }
@keyframes kf-spin { to { transform: rotate(360deg); } }
@keyframes kf-rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
@keyframes kf-draw { from { stroke-dashoffset: 320; } to { stroke-dashoffset: 0; } }
.kf-marquee { display: flex; width: max-content; animation: kf-marquee 38s linear infinite; }
.kf-marquee:hover { animation-play-state: paused; }
.kf-spin { animation: kf-spin 22s linear infinite; }
.kf-h1 > span { display: block; animation: kf-rise .9s cubic-bezier(.2,.7,.2,1) both; }
.kf-h1 > span:nth-child(2) { animation-delay: .12s; }
.kf-underline path { stroke-dasharray: 320; animation: kf-draw 1.1s .7s cubic-bezier(.4,0,.2,1) both; }
.kf-btn { transition: transform .18s ease, box-shadow .18s ease, background-color .18s ease; }
.kf-btn:hover { transform: translate(-2px,-2px); }
.kf-btn:active { transform: translate(0,0); }
.kf-link { background-image: linear-gradient(currentColor, currentColor); background-size: 0 1.5px; background-position: 0 100%; background-repeat: no-repeat; transition: background-size .25s ease; }
.kf-link:hover { background-size: 100% 1.5px; }
.kf-tile { transition: transform .25s ease, box-shadow .25s ease; }
.kf-tile:hover { transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .kf-marquee, .kf-spin, .kf-h1 > span, .kf-underline path { animation: none !important; }
  .kf-ready .kf-reveal:not(.kf-in) { opacity: 1; transform: none; }
}
`;

/* ─────────────────────────────  piezas  ───────────────────────────── */

function Wordmark({ light = false }: { light?: boolean }) {
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

function Nav() {
  return (
    <header className="sticky top-0 z-50" style={{ background: `${PAPER}E6`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between px-5 md:px-8">
        <A href="/">
          <Wordmark />
        </A>
        <nav className="hidden items-center gap-8 text-[14.5px] font-semibold lg:flex" aria-label="Secciones">
          <a href="#alumnos" onClick={scrollToId('alumnos')} className="kf-link">Para alumnos</a>
          <a href="#academias" onClick={scrollToId('academias')} className="kf-link">Para academias</a>
          <a href="#como" onClick={scrollToId('como')} className="kf-link">Cómo funciona</a>
          <a href="#planes" onClick={scrollToId('planes')} className="kf-link">Planes</a>
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          <A href="/sign-in" className="kf-link px-2 text-[14.5px] font-bold">
            Entrar
          </A>
          <A
            href="/sign-up"
            className="kf-btn rounded-full px-4 py-2.5 text-[14px] font-extrabold text-white md:px-5"
            style={{ background: INK }}
          >
            Empezar gratis
          </A>
        </div>
      </div>
    </header>
  );
}

/** Sello circular que gira: la idea del producto en tres verbos. */
function Seal() {
  return (
    <svg viewBox="0 0 120 120" width="118" height="118" className="kf-spin" aria-hidden>
      <defs>
        <path id="kf-circle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#E4572E" />
      <text fontSize="11.5" fontFamily="JetBrainsMono_700Bold, monospace" letterSpacing="3.1" fill="#fff">
        <textPath href="#kf-circle">DESCUBRE · RESERVA · PAGA · ASISTE ·</textPath>
      </text>
    </svg>
  );
}

const BOARD = [
  { time: '18:00', name: 'Bachata inicial', who: 'con Marina', room: 'Sala 1', taken: 9, cap: 16 },
  { time: '19:15', name: 'Salsa on2', who: 'con Diego', room: 'Sala 2', taken: 14, cap: 16 },
  { time: '20:30', name: 'Kizomba · nivel 2', who: 'con Aline', room: 'Sala 1', taken: 12, cap: 12 },
];

function Board() {
  return (
    <div
      className="w-[min(100%,372px)] rounded-[22px] p-5"
      style={{ background: '#fff', border: `2px solid ${INK}`, boxShadow: `7px 7px 0 ${INK}`, transform: 'rotate(-2.2deg)' }}
    >
      <div className="kf-mono mb-4 flex items-center justify-between text-[11px] font-bold">
        <span>Martes 14 · Hoy</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          3 clases
        </span>
      </div>
      <div className="flex flex-col">
        {BOARD.map((c, i) => {
          const full = c.taken >= c.cap;
          return (
            <div key={c.time} className="flex items-center gap-3 py-3" style={{ borderTop: i ? `1.5px dashed ${INK}33` : 'none' }}>
              <span className="kf-mono w-[46px] text-[13px] font-bold">{c.time}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold leading-tight">{c.name}</div>
                <div className="text-[12.5px]" style={{ color: `${INK}99` }}>
                  {c.who} · {c.room}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex gap-[3px]" aria-label={`${c.taken} de ${c.cap} lugares`}>
                  {Array.from({ length: 8 }).map((_, k) => (
                    <span
                      key={k}
                      className="h-[14px] w-[5px] rounded-[2px]"
                      style={{ background: k < Math.round((c.taken / c.cap) * 8) ? (full ? '#E4572E' : INK) : `${INK}22` }}
                    />
                  ))}
                </div>
                <span className="kf-mono text-[10px] font-bold" style={{ color: full ? '#E4572E' : `${INK}99` }}>
                  {full ? 'Lista de espera' : `${c.cap - c.taken} lugares`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 md:px-8 md:pb-24 md:pt-16">
      <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-8">
        <div>
          <p className="kf-mono mb-6 flex items-center gap-3 text-[12px] font-bold" style={{ color: `${INK}B3` }}>
            <span className="inline-block h-[2px] w-8 bg-primary" />
            Clases de baile · academias · instructores
          </p>
          <h1 className="kf-h1 font-extrabold leading-[0.93] tracking-[-0.045em] text-[clamp(2.6rem,6.3vw,5.6rem)]">
            <span>La agenda de tu</span>
            <span>
              academia,{' '}
              <span className="relative inline-block text-primary">
                al compás.
                <svg className="kf-underline absolute -bottom-[0.18em] left-0 w-full" viewBox="0 0 300 18" fill="none" preserveAspectRatio="none" aria-hidden>
                  <path d="M3 12 C 50 2, 90 18, 140 9 S 235 2, 297 11" stroke="#E4572E" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          </h1>
          <p className="mt-8 max-w-[520px] text-[19px] leading-[1.5]" style={{ color: `${INK}CC` }}>
            Publica tus clases, controla el cupo, cobra y pasa lista desde un solo lugar. Y para quien baila: encuentra una clase cerca, reserva en
            dos toques y listo.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <A
              href="/sign-up"
              className="kf-btn rounded-full bg-primary px-7 py-4 text-[16px] font-extrabold text-white"
              style={{ border: `2px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}
            >
              Crear mi academia
            </A>
            <A href="/sign-up" className="kf-btn rounded-full bg-white px-7 py-4 text-[16px] font-extrabold" style={{ border: `2px solid ${INK}` }}>
              Quiero tomar clases
            </A>
          </div>
          <p className="mt-5 text-[13.5px]" style={{ color: `${INK}99` }}>
            Gratis para empezar. Funciona en el navegador, en Android y en iPhone.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[470px] pb-16 lg:mx-0 lg:justify-self-end">
          <div
            className="aspect-[4/5] w-[86%] overflow-hidden"
            style={{ borderRadius: '999px 999px 28px 28px', border: `2px solid ${INK}`, background: '#cfe6df' }}
          >
            <img src={photos.hero} alt="Pareja bailando en una clase" className="h-full w-full object-cover" />
          </div>
          <div className="absolute -right-1 top-6 md:-right-4">
            <Seal />
          </div>
          <div className="absolute -bottom-0 left-0 w-full">
            <Board />
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  const items = [...DISCIPLINES, ...DISCIPLINES];
  return (
    <div className="overflow-hidden py-5" style={{ background: INK, color: PAPER, transform: 'rotate(-1.1deg) scale(1.02)' }} aria-hidden>
      <div className="kf-marquee">
        {items.map((d, i) => (
          <span key={i} className="flex items-center whitespace-nowrap text-[26px] font-extrabold tracking-[-0.02em] md:text-[34px]">
            <span className="px-6 md:px-9">{d}</span>
            <span className="text-[#E4572E]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Num({ n, light = false }: { n: string; light?: boolean }) {
  return (
    <span className="kf-mono text-[13px] font-bold" style={{ color: light ? '#43c9ac' : '#00947e' }}>
      {n}
    </span>
  );
}

function ListItem({ n, title, text, light = false }: { n: string; title: string; text: string; light?: boolean }) {
  return (
    <li className="grid grid-cols-[34px_1fr] gap-x-3 py-5" style={{ borderTop: `1.5px solid ${light ? '#ffffff2e' : `${INK}22`}` }}>
      <Num n={n} light={light} />
      <div>
        <h3 className="text-[20px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h3>
        <p className="mt-1.5 text-[15.5px] leading-[1.5]" style={{ opacity: 0.78 }}>
          {text}
        </p>
      </div>
    </li>
  );
}

function Audiences() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal>
        <h2 className="max-w-[760px] font-extrabold leading-[0.98] tracking-[-0.04em] text-[clamp(2.2rem,5vw,4rem)]">
          Dos lados de la misma clase, bien conectados.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <article id="alumnos" className="h-full scroll-mt-24 rounded-[28px] p-7 md:p-10" style={{ background: '#fff', border: `2px solid ${INK}` }}>
            <p className="kf-mono text-[12px] font-bold text-primary">Para quien baila</p>
            <h3 className="mt-3 text-[34px] font-extrabold leading-[1] tracking-[-0.035em] md:text-[42px]">Encuentra tu clase y resérvala.</h3>
            <ul className="mt-8">
              <ListItem n="01" title="Academias cerca de ti" text="Explora el mapa, filtra por ritmo y nivel, mira horarios y cupo antes de decidir." />
              <ListItem n="02" title="Reserva con lugar asegurado" text="Si la clase está llena, entras a la lista de espera y te avisamos cuando se libera un lugar." />
              <ListItem n="03" title="Paga como te acomode" text="Con tarjeta, efectivo o transferencia, o con el pase o membresía que ya tengas." />
              <ListItem n="04" title="Tu historial a la mano" text="Tus próximas clases, tus pagos y tus recibos, sin escribirle a nadie por mensaje." />
            </ul>
          </article>
        </Reveal>
        <Reveal delay={120}>
          <article id="academias" className="h-full scroll-mt-24 rounded-[28px] p-7 md:p-10" style={{ background: INK, color: PAPER, border: `2px solid ${INK}` }}>
            <p className="kf-mono text-[12px] font-bold" style={{ color: '#43c9ac' }}>Para quien enseña</p>
            <h3 className="mt-3 text-[34px] font-extrabold leading-[1] tracking-[-0.035em] md:text-[42px]">Deja el Excel y los grupos de WhatsApp.</h3>
            <ul className="mt-8">
              <ListItem light n="01" title="Horarios, salas y profesores" text="Crea clases sueltas o recurrentes, asigna sala e instructor y fija el cupo." />
              <ListItem light n="02" title="Alumnos y membresías" text="Un padrón con historial de reservas, pagos y asistencia. Alumnos con o sin cuenta." />
              <ListItem light n="03" title="Cobros en un solo lugar" text="Tarjeta en línea, efectivo y transferencias conciliadas, con corte de caja." />
              <ListItem light n="04" title="Asistencia y reportes" text="Pasa lista desde el celular y mira cómo va tu academia mes a mes." />
            </ul>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    { n: '1', t: 'Publica tu horario', d: 'Da de alta tu academia, tus salas y tus clases. Si repites cada semana, lo haces una sola vez.' },
    { n: '2', t: 'Tu gente reserva', d: 'Los alumnos te encuentran, ven el cupo real y reservan. Nadie te manda mensajes para preguntar si hay lugar.' },
    { n: '3', t: 'Pasas lista y cobras', d: 'Llegas, marcas asistencia en el celular y el dinero ya quedó registrado. Tú solo das la clase.' },
  ];
  return (
    <section id="como" className="scroll-mt-20" style={{ background: '#E9E0CC' }}>
      <div className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
        <Reveal>
          <p className="kf-mono text-[12px] font-bold text-primary">Cómo funciona</p>
          <h2 className="mt-3 max-w-[700px] font-extrabold leading-[0.98] tracking-[-0.04em] text-[clamp(2.2rem,5vw,4rem)]">
            De cero a tu primera clase llena en una tarde.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div>
                <div
                  className="font-extrabold leading-none tracking-[-0.06em] text-[clamp(6rem,11vw,9rem)]"
                  style={{ color: 'transparent', WebkitTextStroke: `2.5px ${INK}` }}
                >
                  {s.n}
                </div>
                <h3 className="mt-2 text-[26px] font-extrabold tracking-[-0.03em]">{s.t}</h3>
                <p className="mt-2.5 max-w-[340px] text-[16.5px] leading-[1.5]" style={{ color: `${INK}C7` }}>
                  {s.d}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tile({ className = '', style, children }: { className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={`kf-tile relative overflow-hidden rounded-[24px] p-6 md:p-7 ${className}`} style={{ border: `2px solid ${INK}`, ...style }}>
      {children}
    </div>
  );
}

function Features() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal>
        <p className="kf-mono text-[12px] font-bold text-primary">Todo en un lugar</p>
        <h2 className="mt-3 max-w-[760px] font-extrabold leading-[0.98] tracking-[-0.04em] text-[clamp(2.2rem,5vw,4rem)]">
          Lo que pasa antes, durante y después de cada clase.
        </h2>
      </Reveal>

      <div className="mt-12 grid auto-rows-[minmax(250px,auto)] gap-5 md:grid-cols-6">
        <Reveal className="md:col-span-3">
          <Tile className="h-full" style={{ background: '#fff' }}>
            <h3 className="text-[26px] font-extrabold tracking-[-0.03em]">Cupo y lista de espera</h3>
            <p className="mt-2 max-w-[360px] text-[15.5px] leading-[1.5]" style={{ color: `${INK}C0` }}>
              El cupo se respeta solo. Si alguien cancela, el primero de la lista toma su lugar.
            </p>
            <div className="mt-6 flex flex-wrap gap-2" aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="h-9 w-9 rounded-full"
                  style={{ background: i < 14 ? INK : i === 14 ? '#E4572E' : 'transparent', border: `2px solid ${i < 15 ? INK : `${INK}44`}` }}
                />
              ))}
            </div>
          </Tile>
        </Reveal>

        <Reveal className="md:col-span-3" delay={100}>
          <Tile className="h-full" style={{ background: '#00947e', color: '#fff' }}>
            <h3 className="text-[26px] font-extrabold tracking-[-0.03em]">Cobros sin perseguir a nadie</h3>
            <p className="mt-2 max-w-[380px] text-[15.5px] leading-[1.5]" style={{ opacity: 0.92 }}>
              Tarjeta en línea, efectivo en recepción o transferencia con comprobante. Todo queda en el historial.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {['Tarjeta', 'Efectivo', 'Transferencia', 'Pases y membresías'].map((p) => (
                <span key={p} className="rounded-full bg-white px-4 py-2 text-[14px] font-extrabold" style={{ color: INK, border: `2px solid ${INK}` }}>
                  {p}
                </span>
              ))}
            </div>
          </Tile>
        </Reveal>

        <Reveal className="md:col-span-2">
          <Tile className="h-full" style={{ background: '#FFE8DF' }}>
            <h3 className="text-[24px] font-extrabold tracking-[-0.03em]">Lista de asistencia</h3>
            <ul className="mt-5 flex flex-col gap-2.5">
              {[
                ['Camila R.', true],
                ['Andrés M.', true],
                ['Lucía F.', false],
                ['Tomás G.', true],
              ].map(([n, ok]) => (
                <li key={String(n)} className="flex items-center gap-3 text-[15px] font-bold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[14px] text-white"
                    style={{ background: ok ? INK : 'transparent', border: `2px solid ${INK}` }}
                    aria-hidden
                  >
                    {ok ? '✓' : ''}
                  </span>
                  {String(n)}
                </li>
              ))}
            </ul>
          </Tile>
        </Reveal>

        <Reveal className="md:col-span-2" delay={100}>
          <Tile className="h-full" style={{ background: '#EEEAF8' }}>
            <h3 className="text-[24px] font-extrabold tracking-[-0.03em]">Equipo y permisos</h3>
            <p className="mt-2 text-[15px] leading-[1.5]" style={{ color: `${INK}C0` }}>
              Propietario, administración, instructores y recepción: cada quien ve y hace solo lo suyo.
            </p>
            <div className="mt-5 flex" aria-hidden>
              {['M', 'D', 'A', 'L'].map((l, i) => (
                <span
                  key={l}
                  className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full text-[17px] font-extrabold text-white first:ml-0"
                  style={{ background: ['#6E4BE8', '#00947e', '#E4572E', INK][i], border: `2.5px solid #EEEAF8` }}
                >
                  {l}
                </span>
              ))}
            </div>
          </Tile>
        </Reveal>

        <Reveal className="md:col-span-2" delay={200}>
          <Tile className="h-full" style={{ background: '#fff' }}>
            <h3 className="text-[24px] font-extrabold tracking-[-0.03em]">Reportes claros</h3>
            <p className="mt-2 text-[15px] leading-[1.5]" style={{ color: `${INK}C0` }}>
              Ingresos, asistencia y ocupación por clase, para decidir qué horarios mantener.
            </p>
            <div className="mt-5 flex h-[74px] items-end gap-2" aria-hidden>
              {[34, 52, 40, 66, 58, 74, 90].map((h, i) => (
                <span key={i} className="flex-1 rounded-t-[6px]" style={{ height: `${h}%`, background: i === 6 ? '#E4572E' : INK }} />
              ))}
            </div>
          </Tile>
        </Reveal>
      </div>
    </section>
  );
}

function Seal2() {
  return (
    <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden>
      <path
        d="M50 4l9 7 11-2 6 10 11 3 1 12 9 7-4 11 4 11-9 7-1 12-11 3-6 10-11-2-9 7-9-7-11 2-6-10-11-3-1-12-9-7 4-11-4-11 9-7 1-12 11-3 6-10 11 2z"
        fill="#00947e"
        stroke={INK}
        strokeWidth="2.5"
      />
      <path d="M31 51l13 13 25-27" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Trust() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 md:px-8">
      <Reveal>
        <div
          className="grid items-center gap-8 rounded-[28px] p-7 md:grid-cols-[auto_1fr] md:gap-12 md:p-12"
          style={{ background: '#fff', border: `2px solid ${INK}`, boxShadow: `7px 7px 0 ${INK}` }}
        >
          <Seal2 />
          <div>
            <h2 className="text-[clamp(1.7rem,3.4vw,2.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              Academias verificadas, para reservar con confianza.
            </h2>
            <p className="mt-3 max-w-[720px] text-[17px] leading-[1.5]" style={{ color: `${INK}C7` }}>
              Antes de aparecer con el sello, cada academia pasa por una revisión de su identidad y su ubicación. Quien reserva sabe a dónde va; quien
              enseña se distingue de quien improvisa.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Plans() {
  return (
    <section id="planes" className="scroll-mt-20 mx-auto w-full max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
        <Reveal>
          <p className="kf-mono text-[12px] font-bold text-primary">Planes</p>
          <h2 className="mt-3 max-w-[720px] font-extrabold leading-[0.98] tracking-[-0.04em] text-[clamp(2.2rem,5vw,4rem)]">
            Empieza gratis. Crece cuando tu academia lo pida.
          </h2>
          <p className="mt-5 max-w-[560px] text-[18px] leading-[1.5]" style={{ color: `${INK}C7` }}>
            Crear tu academia y publicar tus primeras clases no cuesta nada. Cuando sumes alumnos, sedes o equipo, pasas a un plan de pago desde la
            misma app, sin migrar nada.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="flex flex-wrap gap-2.5" aria-label="Planes disponibles">
            {['Gratis', 'Starter', 'Pro', 'Business'].map((p, i) => (
              <span
                key={p}
                className="rounded-full px-5 py-2.5 text-[15px] font-extrabold"
                style={{ background: i === 0 ? INK : '#fff', color: i === 0 ? PAPER : INK, border: `2px solid ${INK}` }}
              >
                {p}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 pb-20 md:px-8 md:pb-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[32px] p-8 md:p-16" style={{ background: INK, color: PAPER }}>
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-[340px] w-[340px] rounded-full"
            style={{ border: '2px dashed #43c9ac66' }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-4 -top-10 h-[200px] w-[200px] rounded-full"
            style={{ border: '2px solid #E4572E88' }}
            aria-hidden
          />
          <h2 className="relative max-w-[820px] font-extrabold leading-[0.95] tracking-[-0.045em] text-[clamp(2.4rem,6vw,5rem)]">
            Pon tu primera clase en el horario.
          </h2>
          <p className="relative mt-5 max-w-[520px] text-[18px] leading-[1.5]" style={{ opacity: 0.8 }}>
            Crea tu cuenta, da de alta tu academia y comparte el enlace. El resto se arma solo.
          </p>
          <div className="relative mt-9 flex flex-wrap gap-3">
            <A
              href="/sign-up"
              className="kf-btn rounded-full bg-primary px-8 py-4 text-[16px] font-extrabold text-white"
              style={{ border: `2px solid ${PAPER}` }}
            >
              Crear mi cuenta
            </A>
            <A href="/sign-in" className="kf-btn rounded-full px-8 py-4 text-[16px] font-extrabold" style={{ border: `2px solid ${PAPER}66` }}>
              Ya tengo cuenta
            </A>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
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

function Landing() {
  // Las animaciones de aparición solo se activan con JavaScript: sin él (o antes de hidratar) todo el contenido está visible.
  useEffect(() => {
    document.documentElement.classList.add('kf-ready');
    return () => document.documentElement.classList.remove('kf-ready');
  }, []);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: PAPER }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="kf-root w-full" style={{ background: PAPER }}>
        <Nav />
        <main>
          <Hero />
          <Marquee />
          <Audiences />
          <Steps />
          <Features />
          <Trust />
          <Plans />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </ScrollView>
  );
}
