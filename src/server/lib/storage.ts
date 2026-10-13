import { AwsClient } from 'aws4fetch';

import { env } from '../env';

/**
 * Almacenamiento de archivos en Cloudflare R2 (compatible con S3). Los archivos pasan por nuestra API —que valida
 * tipo, contenido y tamaño— y de ahí se suben a R2; el bucket es de lectura pública y solo la API escribe en él.
 * `aws4fetch` firma con SigV4 usando solo `fetch`, así funciona igual en Node y en Cloudflare Workers.
 */
export const storageEnabled = () => !!env.r2;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
const EXT: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Tipo real de la imagen según sus primeros bytes (no se confía en lo que diga el cliente). */
export function sniffImage(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  return null;
}

export const extensionOf = (t: ImageType) => EXT[t];

function client() {
  const r2 = env.r2!;
  return { aws: new AwsClient({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, service: 's3', region: 'auto' }), r2 };
}

const objectUrl = (key: string) => {
  const r2 = env.r2!;
  return `${r2.endpoint}/${r2.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

/** Sube un objeto y devuelve su URL pública. Las claves llevan un id aleatorio, así que son inmutables y cacheables. */
export async function putObject(key: string, body: ArrayBuffer | Uint8Array, contentType: string) {
  const { aws, r2 } = client();
  const res = await aws.fetch(objectUrl(key), {
    method: 'PUT',
    body: body as BodyInit,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // R2 exige Content-Length (responde 411 si el cuerpo viaja por partes, como pasa con `fetch` en Node).
      'Content-Length': String(body.byteLength),
    },
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}`);
  return `${r2.publicUrl}/${key}`;
}

/** Borra un objeto nuestro a partir de su URL pública (ignora URLs ajenas, p. ej. la foto de Google). */
export async function deleteByUrl(url: string | null | undefined) {
  const r2 = env.r2;
  if (!r2 || !url?.startsWith(`${r2.publicUrl}/`)) return;
  const key = url.slice(r2.publicUrl.length + 1);
  try {
    await client().aws.fetch(objectUrl(key), { method: 'DELETE' });
  } catch {
    /* un archivo huérfano no debe tumbar la operación */
  }
}
