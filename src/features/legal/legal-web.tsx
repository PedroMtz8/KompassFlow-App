import { ScrollView } from 'react-native';

import { authClient } from '@/lib/auth-client';
import { PageHead } from '@/features/web/seo';
import { A, Footer, INK, PAPER, Wordmark } from '@/features/web/site';

import { LEGAL, PRIVACY, SUPPORT, TERMS, type LegalSection } from './legal-text';

/**
 * Páginas legales con el diseño de la landing (solo web): aviso de privacidad, términos y soporte. Son HTML normal, así que
 * se renderizan en el servidor y los buscadores y las revisiones de Apple las leen sin ejecutar JavaScript.
 */

type Doc = { path: string; tab: string; kicker: string; title: string; lead: string; sections: LegalSection[] };

const DOCS: Doc[] = [
  {
    path: '/terms',
    tab: 'Términos',
    kicker: 'Reglas del juego',
    title: 'Términos y condiciones',
    lead: 'Lo que puedes esperar de Kompass y lo que esperamos de ti, escrito sin letra chiquita.',
    sections: TERMS,
  },
  {
    path: '/privacy',
    tab: 'Privacidad',
    kicker: 'Tus datos',
    title: 'Aviso de privacidad',
    lead: 'Qué datos guardamos, para qué los usamos, con quién se comparten y cómo ejercer tus derechos.',
    sections: PRIVACY,
  },
  {
    path: '/support',
    tab: 'Soporte',
    kicker: 'Ayuda',
    title: 'Soporte',
    lead: 'Respuestas rápidas a lo que más nos preguntan y la forma de escribirnos si necesitas una persona.',
    sections: SUPPORT,
  },
];

const CSS = `
.kf-root { font-family: HankenGrotesk_400Regular, system-ui, sans-serif; color: ${INK}; -webkit-font-smoothing: antialiased; }
@layer base { .kf-root a { color: inherit; text-decoration: none; } }
.kf-mono { font-family: JetBrainsMono_500Medium, ui-monospace, monospace; letter-spacing: 0.04em; text-transform: uppercase; }
.kf-btn { transition: transform .18s ease, background-color .18s ease; }
.kf-btn:hover { transform: translate(-2px,-2px); }
.kf-btn:active { transform: translate(0,0); }
.kf-link { background-image: linear-gradient(currentColor, currentColor); background-size: 0 1.5px; background-position: 0 100%; background-repeat: no-repeat; transition: background-size .25s ease; }
.kf-link:hover { background-size: 100% 1.5px; }
.kf-toc a { transition: color .15s ease, padding-left .15s ease; }
.kf-toc a:hover { padding-left: 6px; }
.kf-sec { scroll-margin-top: 92px; }
`;

function scrollToId(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function LegalNav({ current }: { current: string }) {
  // Con sesión iniciada el servidor no lo sabe (dibuja la versión pública) y el navegador lo ajusta al cargar la sesión.
  const signedIn = !!authClient.useSession().data;
  return (
    <header className="sticky top-0 z-50" style={{ background: `${PAPER}E6`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between px-5 md:px-8">
        <A href="/">
          <Wordmark />
        </A>
        <div className="flex items-center gap-2 md:gap-3">
          {signedIn ? (
            <A href="/" className="kf-btn rounded-full px-4 py-2.5 text-[14px] font-extrabold text-white md:px-5" style={{ background: INK }}>
              Abrir la app
            </A>
          ) : (
            <>
              <A href="/" className="kf-link hidden px-2 text-[14.5px] font-bold sm:inline">
                Inicio
              </A>
              <A href="/sign-in" className="kf-link px-2 text-[14.5px] font-bold">
                Entrar
              </A>
              <A href="/sign-up" className="kf-btn rounded-full px-4 py-2.5 text-[14px] font-extrabold text-white md:px-5" style={{ background: INK }}>
                Empezar gratis
              </A>
            </>
          )}
        </div>
      </div>
      <span className="sr-only">{current}</span>
    </header>
  );
}

function Tabs({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Documentos">
      {DOCS.map((d) => {
        const on = d.path === current;
        return (
          <A
            key={d.path}
            href={d.path}
            className="kf-btn rounded-full px-4 py-2 text-[14px] font-extrabold"
            style={{ background: on ? INK : 'transparent', color: on ? PAPER : INK, border: `2px solid ${INK}` }}
          >
            {d.tab}
          </A>
        );
      })}
    </nav>
  );
}

function ContactCard() {
  return (
    <aside
      className="mt-12 flex flex-col gap-4 rounded-[28px] p-7 md:flex-row md:items-center md:justify-between md:p-9"
      style={{ background: INK, color: PAPER, boxShadow: `6px 6px 0 0 ${INK}22` }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="kf-mono text-[11.5px]" style={{ opacity: 0.7 }}>
          ¿Aún con dudas?
        </span>
        <p className="text-[22px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[26px]">Escríbenos y una persona te responde.</p>
        <p className="text-[14.5px]" style={{ opacity: 0.75 }}>
          Normalmente en menos de 2 días hábiles.
        </p>
      </div>
      <a
        href={`mailto:${LEGAL.contactEmail}`}
        className="kf-btn inline-flex w-fit rounded-full bg-primary px-6 py-3.5 text-[15px] font-extrabold text-white"
        style={{ border: `2px solid ${PAPER}` }}
      >
        {LEGAL.contactEmail}
      </a>
    </aside>
  );
}

function LegalPage({ doc }: { doc: Doc }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: PAPER }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator>
      <PageHead title={`${doc.title} · Kompass`} description={doc.lead} path={doc.path} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="kf-root w-full" style={{ background: PAPER }}>
        <LegalNav current={doc.title} />
        <main className="mx-auto w-full max-w-[1240px] px-5 pb-20 pt-10 md:px-8 md:pt-16">
          <div className="flex flex-col gap-6" style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 40 }}>
            <Tabs current={doc.path} />
            <span className="kf-mono text-[12.5px] text-primary">{doc.kicker}</span>
            <h1 className="max-w-[900px] text-[clamp(2.5rem,7vw,5.2rem)] font-extrabold leading-[0.95] tracking-[-0.045em]">{doc.title}</h1>
            <p className="max-w-[620px] text-[18px] leading-[1.5]" style={{ opacity: 0.8 }}>
              {doc.lead}
            </p>
            <span className="kf-mono text-[11.5px]" style={{ opacity: 0.6 }}>
              Actualizado el {LEGAL.updated}
            </span>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-16">
            <nav className="kf-toc hidden lg:block" aria-label="Contenido">
              <ol className="sticky top-[96px] flex flex-col gap-3">
                <li className="kf-mono mb-1 text-[11.5px]" style={{ opacity: 0.6 }}>
                  Contenido
                </li>
                {doc.sections.map((s, i) => (
                  <li key={s.title}>
                    <a
                      href={`#s${i + 1}`}
                      onClick={scrollToId(`s${i + 1}`)}
                      className="flex gap-3 text-[14.5px] font-bold leading-[1.3]"
                      style={{ opacity: 0.85 }}
                    >
                      <span className="kf-mono w-5 shrink-0 text-primary">{String(i + 1).padStart(2, '0')}</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex min-w-0 flex-col">
              {doc.sections.map((s, i) => (
                <section key={s.title} id={`s${i + 1}`} className="kf-sec flex flex-col gap-3 py-8 first:pt-0" style={{ borderTop: i ? `1px solid ${INK}22` : 'none' }}>
                  <div className="flex items-baseline gap-4">
                    <span className="kf-mono text-[13px] text-primary">{String(i + 1).padStart(2, '0')}</span>
                    <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[32px]">{s.title}</h2>
                  </div>
                  <div className="flex max-w-[68ch] flex-col gap-3.5 md:pl-[46px]">
                    {s.body.map((p) => (
                      <p key={p} className="text-[16.5px] leading-[1.7]" style={{ color: `${INK}D9` }}>
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
              <ContactCard />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </ScrollView>
  );
}

export const PrivacyPage = () => <LegalPage doc={DOCS[1]} />;
export const TermsPage = () => <LegalPage doc={DOCS[0]} />;
export const SupportPage = () => <LegalPage doc={DOCS[2]} />;
