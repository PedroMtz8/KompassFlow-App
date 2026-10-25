import { Button, Text } from '@react-email/components';

import { EmailLayout, styles } from './layout';

export function InvitationEmail({ inviter, organization, role, url }: { inviter: string; organization: string; role: string; url: string }) {
  return (
    <EmailLayout preview={`${inviter} te invitó a ${organization}`}>
      <Text style={styles.h1}>Te invitaron a {organization}</Text>
      <Text style={styles.p}>
        {inviter} te invitó a formar parte del equipo de <strong>{organization}</strong> como <strong>{role}</strong>.
      </Text>
      <Text style={styles.p}>Entra a Kompass con este mismo correo y verás la invitación para aceptarla. Si aún no tienes cuenta, créala con él.</Text>
      <Button href={url} style={styles.button}>
        Ver la invitación
      </Button>
      <Text style={styles.small}>La invitación vence en 7 días.</Text>
    </EmailLayout>
  );
}
