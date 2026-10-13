import type { Client, InValue } from '@libsql/client';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Respaldo lógico de la base de datos: el esquema (tablas, índices, vistas, triggers) y todas las filas, en un solo archivo
 * JSON comprimido y, si hay clave, cifrado con AES-256-GCM. Sirve para Turso y para SQLite local, y se restaura en una base vacía.
 * (Turso además ofrece restaurar a un punto en el tiempo en sus planes de pago: esto es la copia propia, fuera de Turso.)
 */
export type Dump = {
  version: 1;
  createdAt: string;
  /** Sentencias CREATE de tablas, en el orden en que se restauran. */
  tables: { name: string; sql: string; columns: string[]; rows: unknown[][] }[];
  /** Índices, vistas y triggers: se crean al final. */
  extras: string[];
};

const skip = (name: string) => name.startsWith('sqlite_') || name.startsWith('__drizzle') || name.startsWith('_litestream');
const q = (id: string) => `"${id.replaceAll('"', '""')}"`;

const encode = (v: unknown): unknown => {
  if (typeof v === 'bigint') return { $int: v.toString() };
  if (v instanceof ArrayBuffer) return { $b64: Buffer.from(v).toString('base64') };
  if (ArrayBuffer.isView(v)) return { $b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') };
  return v ?? null;
};
const decode = (v: unknown): InValue => {
  if (v && typeof v === 'object') {
    const o = v as { $int?: string; $b64?: string };
    if (o.$int !== undefined) return BigInt(o.$int);
    if (o.$b64 !== undefined) return Buffer.from(o.$b64, 'base64');
  }
  return (v ?? null) as InValue;
};

/** Lee todo en UNA transacción de lectura: el respaldo es una foto consistente, aunque la app siga escribiendo. */
export async function dump(client: Client): Promise<Dump> {
  const meta = await client.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid");
  const objs = meta.rows.map((r) => ({ type: String(r.type), name: String(r.name), sql: String(r.sql) })).filter((o) => !skip(o.name));
  const tableNames = objs.filter((o) => o.type === 'table').map((o) => o.name);

  const fk = await client.batch(tableNames.map((t) => `PRAGMA foreign_key_list(${q(t)})`), 'read');
  const deps = new Map(tableNames.map((t, i) => [t, new Set(fk[i].rows.map((r) => String(r.table)).filter((d) => d !== t && tableNames.includes(d)))]));
  // Orden de restauración: primero lo que no depende de nada (las tablas referenciadas van antes que las que las referencian).
  const ordered: string[] = [];
  const pending = new Set(tableNames);
  while (pending.size) {
    const ready = [...pending].filter((t) => [...deps.get(t)!].every((d) => !pending.has(d)));
    const next = ready.length ? ready : [[...pending][0]]; // ciclo: se rompe en cualquier punto (FK diferidas al restaurar)
    for (const t of next) {
      ordered.push(t);
      pending.delete(t);
    }
  }

  const data = await client.batch(ordered.map((t) => `SELECT * FROM ${q(t)}`), 'read');
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: ordered.map((name, i) => ({
      name,
      sql: objs.find((o) => o.name === name)!.sql,
      columns: data[i].columns,
      rows: data[i].rows.map((row) => data[i].columns.map((_, c) => encode(row[c]))),
    })),
    extras: objs.filter((o) => o.type !== 'table').map((o) => o.sql),
  };
}

/** Restaura en una base VACÍA (nunca pisa datos): crea tablas, inserta filas por lotes y al final crea índices y triggers. */
export async function restore(client: Client, d: Dump) {
  if (d.version !== 1) throw new Error(`Versión de respaldo no soportada: ${d.version}`);
  const existing = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\'");
  if (existing.rows.length) throw new Error(`La base de destino NO está vacía (${existing.rows.length} tablas). Restaura en una base nueva.`);

  for (const t of d.tables) await client.execute(t.sql);
  for (const t of d.tables) {
    const insert = `INSERT INTO ${q(t.name)} (${t.columns.map(q).join(', ')}) VALUES (${t.columns.map(() => '?').join(', ')})`;
    for (let i = 0; i < t.rows.length; i += 200) {
      await client.batch(
        [
          { sql: 'PRAGMA defer_foreign_keys = ON', args: [] },
          ...t.rows.slice(i, i + 200).map((row) => ({ sql: insert, args: row.map(decode) })),
        ],
        'write'
      );
    }
  }
  for (const sql of d.extras) await client.execute(sql);
  const bad = await client.execute('PRAGMA foreign_key_check');
  if (bad.rows.length) throw new Error(`El respaldo se restauró con ${bad.rows.length} referencias rotas (revisa el archivo).`);
  return Object.fromEntries(d.tables.map((t) => [t.name, t.rows.length]));
}

const MAGIC = Buffer.from('SLBK1');
const keyOf = (secret: string) => scryptSync(secret, 'stagelight-backup-v1', 32);

/** Dump → bytes. Con `secret` queda cifrado (AES-256-GCM); sin él, solo comprimido. */
export function pack(d: Dump, secret?: string): Buffer {
  const zipped = gzipSync(Buffer.from(JSON.stringify(d)));
  if (!secret) return zipped;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const body = Buffer.concat([c.update(zipped), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function unpack(bytes: Buffer, secret?: string): Dump {
  let zipped = bytes;
  if (bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!secret) throw new Error('El respaldo está cifrado: indica BACKUP_ENCRYPTION_KEY.');
    const iv = bytes.subarray(MAGIC.length, MAGIC.length + 12);
    const tag = bytes.subarray(MAGIC.length + 12, MAGIC.length + 28);
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), iv);
    d.setAuthTag(tag);
    try {
      zipped = Buffer.concat([d.update(bytes.subarray(MAGIC.length + 28)), d.final()]);
    } catch {
      throw new Error('No se pudo descifrar: la clave es incorrecta o el archivo está dañado.');
    }
  }
  return JSON.parse(gunzipSync(zipped).toString('utf8')) as Dump;
}

export const backupName = (encrypted: boolean, at = new Date()) =>
  `stagelight-${at.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.${encrypted ? 'slbak' : 'json.gz'}`;
