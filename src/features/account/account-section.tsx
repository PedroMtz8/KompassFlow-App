import { router } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Camera from 'lucide-react-native/icons/camera';
import FileText from 'lucide-react-native/icons/file-text';
import KeyRound from 'lucide-react-native/icons/key-round';
import Link2 from 'lucide-react-native/icons/link-2';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import MailWarning from 'lucide-react-native/icons/mail-warning';
import Repeat from 'lucide-react-native/icons/repeat';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Trash2 from 'lucide-react-native/icons/trash';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { InfoBanner } from '@/components/ui/info-banner';
import { ListRow } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { useResendVerification } from '@/features/auth/verification';
import { useGoogleLink, useSecurity } from '@/features/security/queries';
import { useStorageEnabled } from '@/features/storage/queries';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { signOut } from '@/lib/sign-out';
import { done } from '@/lib/simulate';
import { pickAndCropImage, uploadImage } from '@/lib/upload';

/**
 * Cuenta de la persona: foto, datos, contraseña, cambio de espacio y cierre de sesión. Es la misma en modo alumno
 * (Perfil → Configuración) y en modo dueño (Más → Configuración), porque la cuenta es una sola.
 */
export function AccountSection() {
  const user = authClient.useSession().data?.user;
  const storage = useStorageEnabled();
  const security = useSecurity();
  const google = useGoogleLink();
  const resend = useResendVerification();
  const googleLinked = !!security.data?.providers.includes('google');

  // La sesión guarda una copia del usuario; al abrir la cuenta se vuelve a pedir para ver la foto y los datos al día.
  useEffect(() => {
    authClient.getSession({ query: { disableCookieCache: true } });
  }, []);
  const [uploading, setUploading] = useState(false);

  const changeAvatar = async () => {
    if (storage.data && !storage.data.enabled) return done('El almacenamiento de archivos aún no está configurado.');
    try {
      const asset = await pickAndCropImage({ aspect: 1, outputWidth: 800, title: 'Foto de perfil' });
      if (!asset) return;
      setUploading(true);
      await uploadImage('/me/avatar', asset);
      // La sesión guarda una copia del usuario: se pide de nuevo para ver la foto nueva.
      await authClient.getSession({ query: { disableCookieCache: true } });
      done('Foto actualizada');
    } catch (e) {
      done(e instanceof Error ? e.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  // Foto subida por la persona (no la del proveedor con el que entró): se puede quitar para volver a la original.
  const customPhoto = !!user?.image && !/googleusercontent\.com|gravatar\.com/.test(user.image);
  const resetAvatar = async () => {
    setUploading(true);
    try {
      const { error } = await api.me.avatar.delete();
      if (error) throw new Error('No se pudo quitar la foto.');
      await authClient.getSession({ query: { disableCookieCache: true } });
      done('Foto quitada');
    } catch (e) {
      done(e instanceof Error ? e.message : 'No se pudo quitar la foto.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <View className="flex-row items-center gap-3 pb-1.5 pt-1">
        <Pressable onPress={changeAvatar} disabled={uploading} accessibilityLabel="Cambiar foto de perfil" className="active:opacity-80">
          <Avatar uri={user?.image} name={user?.name} size={54} radius={18} />
          <View className="absolute -bottom-1 -right-1 h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-background bg-ink">
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Icon as={Camera} size={11} color="#fff" />}
          </View>
        </Pressable>
        <View className="min-w-0 flex-1 gap-[3px]">
          <Text variant="h3" numberOfLines={1}>
            {user?.name}
          </Text>
          <Text variant="muted" numberOfLines={1}>
            {user?.email}
          </Text>
          {customPhoto ? (
            <Pressable onPress={resetAvatar} disabled={uploading} className="self-start py-0.5 active:opacity-70">
              <Text className="text-xs font-bold text-primary">Quitar mi foto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {user && !user.emailVerified ? (
        <InfoBanner
          icon={MailWarning}
          tone="amber"
          text="Confirma tu correo: lo necesitas para aceptar invitaciones de academias y recuperar tu acceso."
          action={resend.isPending ? 'Enviando…' : 'Reenviar correo'}
          onAction={() =>
            resend.mutate(user.email, { onSuccess: () => done('Te enviamos el correo de confirmación'), onError: (e) => done(e.message) })
          }
        />
      ) : null}
      <ListRow
        icon={Repeat}
        tone="violet"
        title="Cambiar espacio"
        note="Academias, negocio y modo alumno"
        chevron
        onPress={() => router.push('/switch-space')}
      />
      <ListRow
        icon={Lock}
        tone="ink"
        title="Contraseña"
        note="Entrar con correo y contraseña"
        chevron
        onPress={() => router.push('/password')}
      />
      {security.data?.googleAvailable ? (
        <>
          <ListRow
            icon={Link2}
            tone="teal"
            title="Google"
            note={googleLinked ? 'Vinculado: también puedes entrar con Google' : 'Vincula tu cuenta de Google para entrar con un toque'}
            chevron={!googleLinked}
            onPress={
              googleLinked
                ? undefined
                : () => google.link.mutate(undefined, { onError: (e) => done(e.message) })
            }
          />
          {googleLinked && security.data.hasPassword ? (
            <Pressable
              onPress={() =>
                google.unlink.mutate(undefined, { onSuccess: () => done('Google desvinculado'), onError: (e) => done(e.message) })
              }
              disabled={google.unlink.isPending}
              className="-mt-1 self-start px-1 py-1 active:opacity-70"
            >
              <Text className="text-xs font-bold text-muted-foreground">Desvincular Google</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <ListRow
        icon={KeyRound}
        tone="amber"
        title="Tengo un código de mi academia"
        note="Une tu historial a tu cuenta"
        chevron
        onPress={() => router.push('/redeem-code')}
      />
      <ListRow icon={Bell} tone="violet" title="Avisos y recordatorios" note="Qué te avisamos y dónde" chevron onPress={() => router.push('/notifications' as never)} />
      <ListRow icon={ShieldCheck} tone="ink" title="Aviso de privacidad" note="Cómo cuidamos tus datos" chevron onPress={() => router.push('/privacy')} />
      <ListRow icon={FileText} tone="ink" title="Términos y condiciones" note="Las reglas de uso de KompassFlow" chevron onPress={() => router.push('/terms')} />
      <Button
        variant="outline"
        onPress={async () => {
          await signOut();
          router.replace('/sign-in');
        }}
      >
        <Icon as={LogOut} size={17} />
        <Text className="text-sm font-bold">Cerrar sesión</Text>
      </Button>
      <Pressable onPress={() => router.push('/delete-account' as never)} className="flex-row items-center justify-center gap-1.5 py-2 active:opacity-70">
        <Icon as={Trash2} size={14} />
        <Text className="text-[13px] font-bold text-destructive">Eliminar mi cuenta</Text>
      </Pressable>
    </>
  );
}
