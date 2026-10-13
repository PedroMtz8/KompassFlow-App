import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import type * as ImagePickerModule from 'expo-image-picker';
import { Platform } from 'react-native';

import { useCropper, type CropResult } from '@/stores/cropper';

import { getAuthHeaders } from './auth-client';
import { getBaseUrl } from './base-url';

/**
 * Los módulos nativos se cargan al usarlos (no al importar este archivo). Antes de evaluar el paquete se confirma
 * que la app instalada los incluye: si se construyó antes de agregarlos, evaluarlos dispararía la pantalla roja de
 * Metro (no un error capturable), así que se avisa con un mensaje claro.
 */
function loadPicker(): typeof ImagePickerModule {
  if (Platform.OS !== 'web') {
    for (const native of ['ExponentImagePicker', 'ExpoImageManipulator']) {
      if (!requireOptionalNativeModule(native)) {
        throw new Error('Esta versión de la app no incluye el selector de fotos. Vuelve a compilarla con «npx expo run:ios».');
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-image-picker');
}

type CropOptions = { aspect: number; outputWidth: number; title: string };

/** Abre la galería y luego el recortador. Devuelve la imagen recortada (JPEG) o `null` si se cancela en cualquier paso. */
export async function pickAndCropImage({ aspect, outputWidth, title }: CropOptions): Promise<CropResult | null> {
  const ImagePicker = loadPicker();
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (r.canceled) return null;
  const asset = r.assets[0];
  return useCropper.getState().crop({ uri: asset.uri, width: asset.width, height: asset.height, aspect, outputWidth, title });
}

/** Sube la imagen a la API (que valida y la guarda en R2). Devuelve la URL pública. */
export async function uploadImage(path: string, image: CropResult) {
  console.warn(`[upload] ${path}: ${image.name} ${image.type} ${image.uri.slice(-40)}`);
  const form = new FormData();
  if (Platform.OS === 'web') form.append('file', await (await fetch(image.uri)).blob(), image.name);
  // El `fetch` de Expo solo acepta Blob/File reales (no el objeto `{ uri, name, type }` de React Native).
  else form.append('file', new File(image.uri) as unknown as Blob, image.name);

  // Sin `content-type`: el cliente lo arma con el límite (boundary) del multipart.
  const res = await fetch(`${getBaseUrl()}/api${path}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: form,
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
  });
  const raw = await res.text();
  let json: { url?: string; message?: string } | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* la respuesta no era JSON (p. ej. un error de red o del servidor) */
  }
  if (!res.ok || !json?.url) {
    // Queda en la terminal de Metro para poder diagnosticar fallos de subida.
    console.warn(`[upload] ${path} → HTTP ${res.status}: ${raw.slice(0, 300)}`);
    throw new Error(json?.message ?? `No se pudo subir la imagen (error ${res.status}).`);
  }
  return json.url;
}
