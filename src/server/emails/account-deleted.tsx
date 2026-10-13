import { Text } from '@react-email/components';

import { EmailLayout, styles } from './layout';

export function AccountDeletedEmail({ name }: { name: string }) {
  return (
    <EmailLayout preview="Eliminamos tu cuenta de KompasFlow">
      <Text style={styles.h1}>Tu cuenta se eliminó</Text>
      <Text style={styles.p}>
        Hola {name.split(' ')[0]}, eliminamos tu cuenta de KompasFlow y tus datos personales, como pediste. Tus sesiones se cerraron en todos los dispositivos.
      </Text>
      <Text style={styles.p}>
        Las academias donde fuiste alumno conservan los registros de pagos y asistencia que necesitan para su contabilidad, pero ya sin tu nombre, correo ni teléfono.
      </Text>
      <Text style={styles.small}>Si no fuiste tú quien lo pidió, responde a este correo de inmediato.</Text>
    </EmailLayout>
  );
}
