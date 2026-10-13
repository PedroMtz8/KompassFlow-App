import { AwsClient } from 'aws4fetch';

/** Subida/listado/borrado de respaldos en un bucket PRIVADO de R2 (distinto del bucket público de imágenes). */
export type BackupBucket = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

export function bucketFromEnv(env = process.env): BackupBucket | null {
  const bucket = env.R2_BACKUP_BUCKET;
  const accountId = env.R2_ACCOUNT_ID;
  if (!bucket || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !(accountId || env.R2_ENDPOINT)) return null;
  // Los respaldos tienen datos personales: jamás en el bucket que sirve las fotos públicas.
  if (bucket === env.R2_BUCKET) throw new Error('R2_BACKUP_BUCKET debe ser un bucket DISTINTO y privado (no el de las imágenes públicas).');
  return {
    endpoint: (env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, ''),
    bucket,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

const client = (b: BackupBucket) => new AwsClient({ accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey, service: 's3', region: 'auto' });

export async function putBackup(b: BackupBucket, key: string, body: Buffer) {
  const res = await client(b).fetch(`${b.endpoint}/${b.bucket}/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.byteLength) },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`R2 respondió ${res.status} al subir el respaldo: ${(await res.text()).slice(0, 200)}`);
}

export async function getBackup(b: BackupBucket, key: string): Promise<Buffer> {
  const res = await client(b).fetch(`${b.endpoint}/${b.bucket}/${key}`);
  if (!res.ok) throw new Error(`R2 respondió ${res.status} al descargar ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function listBackups(b: BackupBucket, prefix = 'backups/'): Promise<string[]> {
  const res = await client(b).fetch(`${b.endpoint}/${b.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  if (!res.ok) throw new Error(`R2 respondió ${res.status} al listar respaldos`);
  return [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]).sort();
}

export async function deleteBackup(b: BackupBucket, key: string) {
  await client(b).fetch(`${b.endpoint}/${b.bucket}/${key}`, { method: 'DELETE' });
}

/** Conserva los `keep` más recientes (los nombres llevan la fecha, así que el orden alfabético es el cronológico). */
export async function applyRetention(b: BackupBucket, keep: number, prefix = 'backups/') {
  const all = await listBackups(b, prefix);
  const old = all.slice(0, Math.max(all.length - keep, 0));
  for (const key of old) await deleteBackup(b, key);
  return old;
}
