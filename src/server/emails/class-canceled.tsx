import { Button, Text } from '@react-email/components';

import { EmailLayout, styles } from './layout';

export function ClassCanceledEmail({ name, organization, service, when, url }: { name: string; organization: string; service: string; when: string; url: string }) {
  return (
    <EmailLayout preview={`Se canceló ${service} del ${when}`}>
      <Text style={styles.h1}>Se canceló tu clase</Text>
      <Text style={styles.p}>
        Hola {name.split(' ')[0]}, {organization} canceló <strong>{service}</strong> del {when}. Tu reserva se canceló con ella, así que no tienes que hacer nada.
      </Text>
      <Button href={url} style={styles.button}>
        Buscar otra clase
      </Button>
      <Text style={styles.small}>Lamentamos el cambio. Si tienes dudas, escríbele directamente a la academia.</Text>
    </EmailLayout>
  );
}
