import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

/** Colores de marca para correo (los clientes de correo no leen variables CSS: van fijos). */
export const BRAND = { primary: '#E4572E', ink: '#1B1620', muted: '#6B6270', soft: '#FFF7F1', border: '#EDE7EE' } as const;

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Estructura común de los correos: marca arriba, contenido y pie. */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: BRAND.soft, margin: 0, padding: '24px 12px', fontFamily: font, color: BRAND.ink }}>
        <Container style={{ maxWidth: 520, margin: '0 auto' }}>
          <Text style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px', color: BRAND.primary }}>KompasFlow</Text>
          <Section style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: '28px 24px', border: `1px solid ${BRAND.border}` }}>{children}</Section>
          <Hr style={{ borderColor: BRAND.border, margin: '24px 0 12px' }} />
          <Text style={{ fontSize: 12, lineHeight: '18px', color: BRAND.muted, margin: 0 }}>
            Recibes este correo porque alguien usó esta dirección en KompasFlow. Si no fuiste tú, puedes ignorarlo.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  h1: { fontSize: 22, lineHeight: '28px', fontWeight: 800, margin: '0 0 12px', color: BRAND.ink } as const,
  p: { fontSize: 15, lineHeight: '23px', margin: '0 0 14px', color: BRAND.ink } as const,
  small: { fontSize: 12.5, lineHeight: '19px', margin: '14px 0 0', color: BRAND.muted } as const,
  button: {
    display: 'inline-block',
    backgroundColor: BRAND.primary,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
    borderRadius: 14,
    padding: '13px 22px',
  } as const,
  link: { color: BRAND.primary, wordBreak: 'break-all' } as const,
};

export { Link };
