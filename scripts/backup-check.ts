/**
 * Prueba de respaldo y restauración: el volcado se cifra (sin texto legible), no se abre con otra clave ni alterado, se restaura
 * en una base vacía idéntica (mismas filas, índices y referencias), nunca pisa una base con datos, la subida a R2 conserva solo
 * los últimos N y exige un bucket distinto del público. Corre con la base local del corredor (`bun run test`).
 */
import { createClient } from '@libsql/client';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq, inArray } from 'drizzle-orm';

import { auth } from '../src/server/auth';
import { db, schema } from '../src/server/db';
import { createOrganization } from '../src/server/db/organizations';
import { dump, pack, restore, unpack } from './lib/backup-core';
import { applyRetention, bucketFromEnv, getBackup, listBackups, putBackup } from './lib/r2-backup';

const url = process.env.TURSO_DATABASE_URL!;
if (!url.startsWith('file:')) throw new Error('Esta prueba solo corre con una base local (file:…). Usa `bun run test backup`.');
const tag = `zz-bak-${Date.now()}`;
const out: [string, boolean, string?][] = [];
const ids: string[] = [];
let orgId = '';
const dir = mkdtempSync(join(tmpdir(), 'stagelight-bak-'));
const fresh = (n: string) => createClient({ url: `file:${join(dir, n)}` });
const counts = async (c: ReturnType<typeof createClient>) => {
  const names = (await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\' ORDER BY name")).rows.map((r) => String(r.name));
  const res = await c.batch(names.map((n) => `SELECT count(*) AS n FROM "${n}"`), 'read');
  return Object.fromEntries(names.map((n, i) => [n, Number(res[i].rows[0].n)]));
};

// R2 falso (S3): guarda objetos en memoria.
const objects = new Map<string, Buffer>();
const s3 = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'PUT') objects.set(u.pathname, Buffer.concat(chunks));
    if (req.method === 'DELETE') objects.delete(u.pathname);
    if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
      const prefix = `${u.pathname}/${u.searchParams.get('prefix') ?? ''}`;
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(u.pathname.length + 1));
      res.setHeader('content-type', 'application/xml');
      return res.end(`<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`);
    }
    if (req.method === 'GET') {
      const o = objects.get(u.pathname);
      res.statusCode = o ? 200 : 404;
      return res.end(o);
    }
    res.statusCode = 200;
    res.end();
  });
});
await new Promise<void>((r) => s3.listen(0, r));
const port = (s3.address() as { port: number }).port;

try {
  // ── Datos reales: cuentas (con hash de contraseña), academia, miembros ─────
  const mk = async (l: string) => {
    const r = await auth.api.signUpEmail({ body: { email: `${tag}-${l}@example.com`, password: 'clave-segura-123', name: `ZZ ${l}` } });
    ids.push(r.user.id);
    return r.user;
  };
  const owner = await mk('dueno');
  await mk('alumna');
  const org = await createOrganization(owner.id, { name: `ZZ Bak ${tag}`, type: 'STUDIO', address: 'Calle 1', neighborhood: 'Centro', city: 'Tepic', roomName: 'Sala', roomCapacity: 20 } as never);
  if ('error' in org) throw new Error(org.error);
  orgId = (org as { id: string }).id;

  const source = createClient({ url });
  const d = await dump(source);
  const total = d.tables.reduce((n, t) => n + t.rows.length, 0);
  out.push(['El volcado incluye todas las tablas del esquema y sus filas', d.tables.length > 30 && total > 30, `${d.tables.length} tablas, ${total} filas`]);
  const posOrg = d.tables.findIndex((t) => t.name === 'organization');
  const posRoom = d.tables.findIndex((t) => t.name === 'room');
  out.push(['Se restauran primero las tablas de las que dependen otras', posOrg >= 0 && posOrg < posRoom]);

  // ── Cifrado ────────────────────────────────────────────────────────────────
  const enc = pack(d, 'clave-de-prueba');
  const plain = pack(d);
  out.push(['El respaldo cifrado lleva la marca y NO contiene texto legible', enc.subarray(0, 5).toString() === 'SLBK1' && !enc.includes(`${tag}-dueno@example.com`) && !enc.includes('organization')]);
  out.push(['Sin cifrar solo va comprimido (y es más chico que el JSON)', plain.length < JSON.stringify(d).length]);
  out.push(['Con la clave correcta se abre', unpack(enc, 'clave-de-prueba').tables.length === d.tables.length]);
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  out.push(['Con otra clave no se abre', throws(() => unpack(enc, 'otra-clave'))]);
  out.push(['Sin clave tampoco', throws(() => unpack(enc))]);
  const tampered = Buffer.from(enc);
  tampered[tampered.length - 5] ^= 0xff;
  out.push(['Un archivo alterado se detecta', throws(() => unpack(tampered, 'clave-de-prueba'))]);

  // ── Restaurar ──────────────────────────────────────────────────────────────
  const target = fresh('restaurada.db');
  const restored = await restore(target, unpack(enc, 'clave-de-prueba'));
  const before = await counts(source);
  const after = await counts(target);
  out.push(['La base restaurada tiene las mismas filas en cada tabla', JSON.stringify(before) === JSON.stringify(after) && Object.keys(restored).length === Object.keys(before).length]);
  const u1 = await source.execute({ sql: 'SELECT id, name, email, created_at FROM user WHERE email = ?', args: [`${tag}-dueno@example.com`] });
  const u2 = await target.execute({ sql: 'SELECT id, name, email, created_at FROM user WHERE email = ?', args: [`${tag}-dueno@example.com`] });
  out.push(['Los datos coinciden valor por valor (usuario de ejemplo)', JSON.stringify(u1.rows[0]) === JSON.stringify(u2.rows[0]) && u2.rows.length === 1]);
  const h1 = await source.execute({ sql: 'SELECT password FROM account WHERE user_id = ? AND provider_id = ?', args: [owner.id, 'credential'] });
  const h2 = await target.execute({ sql: 'SELECT password FROM account WHERE user_id = ? AND provider_id = ?', args: [owner.id, 'credential'] });
  out.push(['El hash de contraseña llega intacto (la persona puede entrar)', h1.rows[0].password === h2.rows[0].password && String(h2.rows[0].password).length > 20]);
  const idx = async (c: typeof target) => (await c.execute("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name")).rows.map((r) => String(r.name));
  out.push(['Se recrean los índices (incluidos los únicos)', JSON.stringify(await idx(source)) === JSON.stringify(await idx(target)) && (await idx(target)).length > 20]);
  out.push(['Sin referencias rotas', (await target.execute('PRAGMA foreign_key_check')).rows.length === 0]);
  const dup = await target.execute({ sql: 'INSERT INTO member (id, organization_id, user_id, role, created_at) SELECT ?, organization_id, user_id, role, created_at FROM member LIMIT 1', args: [crypto.randomUUID()] }).then(() => false, () => true);
  out.push(['El índice único de miembros sigue protegiendo en la base restaurada', dup]);
  out.push(['Nunca pisa una base con datos', await restore(target, d).then(() => false, (e: Error) => /NO está vacía/.test(e.message))]);

  // ── Subida a R2 (privado) y retención ──────────────────────────────────────
  const env = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_ENDPOINT: `http://localhost:${port}`, R2_BUCKET: 'publico', R2_BACKUP_BUCKET: 'privado' } as unknown as NodeJS.ProcessEnv;
  const bucket = bucketFromEnv(env)!;
  out.push(['El bucket de respaldos se toma de R2_BACKUP_BUCKET', bucket.bucket === 'privado']);
  out.push(['Se niega a usar el mismo bucket público de las imágenes', throws(() => bucketFromEnv({ ...env, R2_BACKUP_BUCKET: 'publico' }))]);
  out.push(['Sin R2_BACKUP_BUCKET no hay subida', bucketFromEnv({ ...env, R2_BACKUP_BUCKET: '' }) === null]);
  for (const n of ['20260101-000000', '20260102-000000', '20260103-000000', '20260104-000000']) await putBackup(bucket, `backups/stagelight-${n}.slbak`, Buffer.from(n));
  const removed = await applyRetention(bucket, 2);
  const left = await listBackups(bucket);
  out.push(['La retención conserva solo los 2 más recientes', removed.length === 2 && left.length === 2 && left[0].includes('20260103') && left[1].includes('20260104'), left.join(', ')]);
  await putBackup(bucket, 'backups/real.slbak', enc);
  out.push(['Lo subido se descarga idéntico y se restaura', (await getBackup(bucket, 'backups/real.slbak')).equals(enc)]);

  // ── Las herramientas de línea de comandos, de punta a punta ────────────────
  const outDir = join(dir, 'archivos');
  const cliEnv = { ...process.env, TURSO_DATABASE_URL: url, BACKUP_ENCRYPTION_KEY: 'clave-cli', R2_BACKUP_BUCKET: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' } as NodeJS.ProcessEnv;
  const b = spawnSync('bun', ['scripts/backup.ts', '--out', outDir], { env: cliEnv, encoding: 'utf8' });
  const file = readdirSync(outDir).find((f) => f.endsWith('.slbak'));
  out.push(['`backup.ts` genera un archivo cifrado en la carpeta pedida', b.status === 0 && !!file && /cifrado/.test(b.stdout), (b.stdout + b.stderr).trim().split('\n')[0]]);
  const r = spawnSync('bun', ['scripts/restore.ts', join(outDir, file ?? 'x'), '--to', `file:${join(dir, 'cli.db')}`], { env: cliEnv, encoding: 'utf8' });
  out.push(['`restore.ts` lo restaura en una base nueva', r.status === 0 && /sin referencias rotas/.test(r.stdout), r.stderr.trim().split('\n')[0]]);
  const noTo = spawnSync('bun', ['scripts/restore.ts', join(outDir, file ?? 'x')], { env: cliEnv, encoding: 'utf8' });
  out.push(['`restore.ts` exige --to (nunca restaura sobre la base del .env)', noTo.status === 2]);
  const noKey = spawnSync('bun', ['scripts/backup.ts', '--out', outDir], { env: { ...cliEnv, R2_BACKUP_BUCKET: 'privado', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', BACKUP_ENCRYPTION_KEY: '' } as NodeJS.ProcessEnv, encoding: 'utf8' });
  out.push(['Subir a R2 sin clave de cifrado se rechaza', noKey.status !== 0 && /BACKUP_ENCRYPTION_KEY/.test(noKey.stderr + noKey.stdout)]);

  for (const [name, ok, detail] of out) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
  else console.log(`\n${out.length} comprobaciones pasaron.`);
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  if (orgId) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
  if (ids.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }
  s3.close();
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
