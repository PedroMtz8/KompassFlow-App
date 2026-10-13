import { Button, Text } from '@react-email/components';

import { EmailLayout, Link, styles } from './layout';

export function ResetPasswordEmail({ name, url }: { name: string; url: string }) {
  return (
    <EmailLayout preview="Crea una contraseña nueva para tu cuenta">
      <Text style={styles.h1}>Restablece tu contraseña</Text>
      <Text style={styles.p}>Hola {name.split(' ')[0]}, recibimos una solicitud para cambiar la contraseña de tu cuenta de KompasFlow.</Text>
      <Button href={url} style={styles.button}>
        Crear contraseña nueva
      </Button>
      <Text style={styles.small}>El enlace sirve 1 hora y solo una vez. Si no lo pediste, no hagas nada: tu contraseña actual sigue funcionando.</Text>
      <Text style={styles.small}>
        ¿No abre el botón? Copia este enlace en tu navegador: <Link href={url} style={styles.link}>{url}</Link>
      </Text>
    </EmailLayout>
  );
}
