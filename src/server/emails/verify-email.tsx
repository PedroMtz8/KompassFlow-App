import { Button, Text } from '@react-email/components';

import { EmailLayout, Link, styles } from './layout';

export function VerifyEmailEmail({ name, url }: { name: string; url: string }) {
  return (
    <EmailLayout preview="Confirma tu correo para terminar de crear tu cuenta">
      <Text style={styles.h1}>Confirma tu correo</Text>
      <Text style={styles.p}>
        Hola {name.split(' ')[0]}, confirma que este correo es tuyo. Es necesario para aceptar invitaciones de academias y para poder recuperar tu acceso.
      </Text>
      <Button href={url} style={styles.button}>
        Confirmar mi correo
      </Button>
      <Text style={styles.small}>El enlace sirve 24 horas.</Text>
      <Text style={styles.small}>
        ¿No abre el botón? Copia este enlace en tu navegador: <Link href={url} style={styles.link}>{url}</Link>
      </Text>
    </EmailLayout>
  );
}
