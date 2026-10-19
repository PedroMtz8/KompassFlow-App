import * as Clipboard from 'expo-clipboard';
import Copy from 'lucide-react-native/icons/copy';
import Share2 from 'lucide-react-native/icons/share-2';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import { useEffect } from 'react';
import { Pressable, Share, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { Text } from '@/components/ui/text';
import { goBack } from '@/lib/nav';
import { done } from '@/lib/simulate';
import { useTheme } from '@/lib/theme';
import { useNow } from '@/lib/use-now';
import { useCredentials } from '@/stores/credentials';

function Line({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View className="gap-1 rounded-2xl bg-card px-4 py-3">
      <Text variant="muted" className="text-[11.5px] font-bold uppercase tracking-[0.06em]">
        {label}
      </Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-mono-bold flex-1 text-[17px]" selectable>
          {value}
        </Text>
        <Pressable
          onPress={async () => {
            await Clipboard.setStringAsync(value);
            done('Copiado');
          }}
          accessibilityLabel={`Copiar ${label.toLowerCase()}`}
          className="h-9 w-9 items-center justify-center rounded-xl bg-muted active:opacity-70"
        >
          <Icon as={Copy} size={16} color={t.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

/** Credenciales recién creadas: se muestran una sola vez. La persona debe cambiar la contraseña al entrar. */
export function CredentialsScreen() {
  const creds = useCredentials((s) => s.creds);
  const clear = useCredentials((s) => s.clear);
  const now = useNow();
  // Al salir de esta pantalla la contraseña se olvida (no queda en memoria).
  useEffect(() => clear, [clear]);

  if (!creds) {
    return (
      <FormScreen title="Credenciales" cta="Volver" onSubmit={goBack}>
        <Text variant="muted">Estas credenciales ya no se pueden mostrar. Regenera una contraseña nueva desde el detalle de la persona.</Text>
      </FormScreen>
    );
  }

  const days = Math.max(1, Math.round((+new Date(creds.expiresAt) - now) / (24 * 3600_000)));
  const message = `Hola ${creds.name.split(' ')[0]}, esta es tu cuenta de KompassFlow${creds.organizationName ? ` en ${creds.organizationName}` : ''}.\n\nCorreo: ${creds.email}\nContraseña temporal: ${creds.password}\n\nAl entrar te pedirá crear tu propia contraseña. La temporal sirve ${days} días.`;

  return (
    <FormScreen
      title={creds.reset ? 'Nueva contraseña temporal' : 'Cuenta creada'}
      subtitle={creds.name}
      cta="Compartir credenciales"
      onSubmit={() => Share.share({ message }).catch(() => {})}
      secondary={{ label: 'Listo, ya las compartí', onPress: goBack }}
    >
      <InfoBanner
        icon={ShieldAlert}
        tone="amber"
        text="Solo las verás ahora. Al entrar, la persona deberá crear su propia contraseña y entonces tú dejas de poder usar la cuenta."
      />
      <Line label="Correo" value={creds.email} />
      <Line label="Contraseña temporal" value={creds.password} />
      <Text variant="muted" className="px-1 text-xs">
        Sirve {days} {days === 1 ? 'día' : 'días'}. Si caduca o la pierde, puedes generar otra mientras no la haya activado.
      </Text>
      <View className="flex-row items-center gap-2 px-1">
        <Icon as={Share2} size={13} />
        <Text variant="muted" className="flex-1 text-xs">
          Compártelas por un canal privado (mensaje directo), no en grupos.
        </Text>
      </View>
    </FormScreen>
  );
}
