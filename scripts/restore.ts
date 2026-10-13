/**
 * Restaurar un respaldo en una base VACÍA (nunca pisa datos).
 *   bun scripts/restore.ts <archivo|clave-en-R2> --to <url-de-la-base> [--token <token-de-turso>]
 * Ejemplos:
 *   bun scripts/restore.ts backups/stagelight-20261008-103000.slbak --to file:./restaurada.db
 *   bun --env-file=.env scripts/restore.ts backups/stagelight-….slbak --to libsql://nueva-base.turso.io --token $TOKEN
 * `--to` es obligatorio a propósito: así nunca se restaura sobre la base del .env por descuido.
 * Si la ruta empieza con «backups/» y no existe como archivo, se baja de R2 (R2_BACKUP_BUCKET).
 */
import { createClient } from '@libsql/client';
import { existsSync, readFileSync } from 'node:fs';

import { restore, unpack } from './lib/backup-core';
import { bucketFromEnv, getBackup } from './lib/r2-backup';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const source = process.argv[2];
const to = arg('--to');
if (!source || source.startsWith('--') || !to) {
  console.error('Uso: bun scripts/restore.ts <archivo|clave-en-R2> --to <url-de-la-base> [--token <token>]');
  process.exit(2);
}
let bytes: Buffer;
if (existsSync(source)) bytes = readFileSync(source);
else {
  const bucket = bucketFromEnv();
  if (!bucket) throw new Error(`No existe el archivo ${source} y no hay R2_BACKUP_BUCKET configurado para buscarlo allá.`);
  bytes = await getBackup(bucket, source);
}
const dumpData = unpack(bytes, process.env.BACKUP_ENCRYPTION_KEY || undefined);
console.log(`Respaldo del ${dumpData.createdAt}: ${dumpData.tables.length} tablas. Restaurando en ${to}…`);
const counts = await restore(createClient({ url: to, authToken: arg('--token') }), dumpData);
for (const [t, n] of Object.entries(counts)) if (n) console.log(`  ${t}: ${n}`);
console.log('Restauración completa y sin referencias rotas.');
process.exit(0);
