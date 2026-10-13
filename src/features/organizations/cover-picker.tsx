import { useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Photo } from '@/components/ui/photo';
import { Text } from '@/components/ui/text';
import { useStorageEnabled } from '@/features/storage/queries';
import { api } from '@/lib/api';
import { done } from '@/lib/simulate';
import { pickAndCropImage, uploadImage } from '@/lib/upload';

import { orgsKey } from './queries';

/** Subida de una imagen de la academia: portada (16:9, se ve arriba del perfil) o logo (cuadrado, es su «foto de perfil»). */
function useOrgImage(kind: 'cover' | 'logo', orgId?: string) {
  const storage = useStorageEnabled();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const cover = kind === 'cover';

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: orgsKey }), qc.invalidateQueries({ queryKey: ['discover'] })]);

  const change = async () => {
    try {
      const asset = await pickAndCropImage(
        cover ? { aspect: 16 / 9, outputWidth: 1600, title: 'Portada' } : { aspect: 1, outputWidth: 800, title: 'Logo de la academia' }
      );
      if (!asset) return;
      setBusy(true);
      await uploadImage(`/orgs/${orgId}/${kind}`, asset);
      await refresh();
      done(cover ? 'Portada actualizada' : 'Logo actualizado');
    } catch (e) {
      done(e instanceof Error ? e.message : 'No se pudo subir la imagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { error } = await api.orgs({ id: orgId! })[kind].delete();
      if (error) throw new Error('No se pudo quitar la imagen.');
      await refresh();
      done(cover ? 'Portada quitada' : 'Logo quitado');
    } catch (e) {
      done(e instanceof Error ? e.message : 'No se pudo quitar la imagen.');
    } finally {
      setBusy(false);
    }
  };

  const unavailable = !orgId
    ? 'Podrás agregar las imágenes después de crear tu academia.'
    : storage.data && !storage.data.enabled
      ? 'Imágenes (almacenamiento de archivos aún sin configurar)'
      : null;

  return { busy, change, remove, unavailable };
}

/** Portada de la academia: elegir de la galería, recortar, cambiar o quitar. Se sube a R2 a través de la API. */
export function CoverPicker({ orgId, coverUrl }: { orgId?: string; coverUrl?: string | null }) {
  const { busy, change, remove, unavailable } = useOrgImage('cover', orgId);

  if (unavailable) {
    return (
      <View className="h-[110px] items-center justify-center gap-1.5 rounded-3xl border-[1.5px] border-dashed border-[#D2C6D5] px-4">
        <Icon as={Camera} size={22} color="#9A93A0" />
        <Text className="text-center text-[13px] font-bold text-subtle">{unavailable}</Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-muted-foreground">Portada · la imagen grande de tu perfil</Text>
      <Pressable
        onPress={change}
        disabled={busy}
        className="h-[150px] items-center justify-center overflow-hidden rounded-3xl border-[1.5px] border-dashed border-[#D2C6D5] bg-card/60 active:opacity-80"
      >
        {coverUrl ? <Photo uri={coverUrl} width="100%" height={150} radius={0} /> : null}
        <View className={coverUrl ? 'absolute inset-0 items-center justify-center bg-black/25' : 'items-center gap-1.5'}>
          {busy ? (
            <ActivityIndicator color={coverUrl ? '#fff' : '#4A4152'} />
          ) : (
            <Icon as={Camera} size={22} color={coverUrl ? '#fff' : '#4A4152'} />
          )}
          <Text className={coverUrl ? 'text-[13px] font-bold text-white' : 'text-[13px] font-bold text-[#4A4152]'}>
            {busy ? 'Subiendo…' : coverUrl ? 'Cambiar portada' : 'Agregar foto de portada'}
          </Text>
        </View>
      </Pressable>
      {coverUrl && !busy ? (
        <Pressable onPress={remove} className="flex-row items-center gap-1.5 self-start px-1 py-1 active:opacity-70">
          <Icon as={Trash2} size={14} color="#6B6270" />
          <Text className="text-xs font-bold text-muted-foreground">Quitar portada</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Logo de la academia (su «foto de perfil»): cuadrado, es el que se ve en listas, tarjetas, mapa y encabezados. */
export function LogoPicker({ orgId, logoUrl, name }: { orgId?: string; logoUrl?: string | null; name?: string }) {
  const { busy, change, remove, unavailable } = useOrgImage('logo', orgId);
  if (unavailable) return null;

  return (
    <View className="flex-row items-center gap-3.5">
      <Pressable onPress={change} disabled={busy} accessibilityLabel="Cambiar logo" className="active:opacity-80">
        <View className="h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-[24px] border-[1.5px] border-dashed border-[#D2C6D5] bg-card/60">
          {logoUrl ? (
            <Photo uri={logoUrl} width={78} height={78} radius={0} />
          ) : (
            <Text className="text-2xl font-extrabold text-subtle">{(name ?? '?').slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View className="absolute -bottom-1 -right-1 h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-background bg-ink">
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon as={Camera} size={12} color="#fff" />}
        </View>
      </Pressable>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-[13.5px] font-bold">Logo de la academia</Text>
        <Text className="text-xs text-muted-foreground">Es la «foto de perfil» de tu academia: aparece en listas, mapa y encabezados.</Text>
        {logoUrl && !busy ? (
          <Pressable onPress={remove} className="flex-row items-center gap-1.5 self-start py-0.5 active:opacity-70">
            <Icon as={Trash2} size={13} color="#6B6270" />
            <Text className="text-xs font-bold text-muted-foreground">Quitar logo</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
