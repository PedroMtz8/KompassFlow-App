/**
 * Respaldo de la base de datos.
 *   bun --env-file=.env scripts/backup.ts [--out ./backups]
 * Lee TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. Si hay BACKUP_ENCRYPTION_KEY el archivo se cifra (obligatorio al subir a R2).
 * Si hay R2_BACKUP_BUCKET (+ credenciales R2) sube el archivo a backups/ en ese bucket PRIVADO y conserva los últimos
 * BACKUP_KEEP (14 por defecto). Sin R2, guarda el archivo en --out.
 */
import { createClient } from '@libsql/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { backupName, dump, pack } from './lib/backup-core';
import { applyRetention, bucketFromEnv, putBackup } from './lib/r2-backup';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Falta TURSO_DATABASE_URL.');
const secret = process.env.BACKUP_ENCRYPTION_KEY || undefined;
const bucket = bucketFromEnv();
if (bucket && !secret) throw new Error('Para subir a R2 define BACKUP_ENCRYPTION_KEY: el respaldo contiene datos personales y debe ir cifrado.');
const outIdx = process.argv.indexOf('--out');
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : './backups';

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
const t0 = Date.now();
const d = await dump(client);
const bytes = pack(d, secret);
const name = backupName(!!secret);
const rows = d.tables.reduce((n, t) => n + t.rows.length, 0);

if (bucket) {
  await putBackup(bucket, `backups/${name}`, bytes);
  const removed = await applyRetention(bucket, Number(process.env.BACKUP_KEEP ?? 14));
  console.log(`Respaldo subido a R2: backups/${name} (${(bytes.length / 1024).toFixed(0)} KB, ${d.tables.length} tablas, ${rows} filas). Borrados por retención: ${removed.length}.`);
} else {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, name);
  writeFileSync(path, bytes);
  console.log(`Respaldo guardado en ${path} (${(bytes.length / 1024).toFixed(0)} KB, ${d.tables.length} tablas, ${rows} filas)${secret ? ', cifrado' : ' — SIN CIFRAR'}.`);
}
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
process.exit(0);
