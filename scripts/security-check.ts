/**
 * Revisión automática de aislamiento entre organizaciones (PRD regla 2) y de autenticación.
 * Recorre TODAS las rutas registradas en la API y las llama como: (1) anónimo, (2) persona ajena a la organización,
 * (3) miembro con rol de instructor. Falla si alguna ruta de organización devuelve 2xx a un anónimo o a un ajeno.
 *
 * Requiere el servidor en marcha (`bun run start` / Metro) y las variables de .env:
 *   bun --env-file=.env scripts/security-check.ts [http://localhost:8081]
 * Crea usuarios y una organización temporales y los borra al terminar.
 */
import { eq, inArray } from 'drizzle-orm';

import { db, schema } from '../src/server/db';
import { api } from '../src/server/app';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const ORIGIN = BASE;
const H = { 'content-type': 'application/json', origin: ORIGIN };
const tag = `zz-sec-${Date.now()}`;

async function signUp(label: string) {
  const email = `${tag}-${label}@example.com`;
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, password: 'clave-segura-123', name: `ZZ ${label}` }),
  });
  if (!r.ok) throw new Error(`sign-up ${label}: ${r.status} ${await r.text()}`);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const json = (await r.json()) as { user: { id: string } };
  return { id: json.user.id, cookie };
}

type Schema = {
  type?: string;
  const?: unknown;
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  minLength?: number;
  minimum?: number;
  pattern?: string;
  format?: string;
};

/** Valor mínimo válido para un esquema TypeBox (solo lo necesario para pasar la validación). */
function make(s: Schema): unknown {
  if (s.const !== undefined) return s.const;
  // Elysia expresa los enteros como «texto numérico o entero»: se prefiere el entero.
  if (s.anyOf) return make(s.anyOf.find((o) => o.type === 'integer' || o.type === 'number') ?? s.anyOf[0]);
  switch (s.type) {
    case 'object':
      return Object.fromEntries((s.required ?? []).map((k) => [k, make(s.properties![k])]));
    case 'string':
      if (s.format === 'email') return 'zz@example.com';
      if (s.pattern?.includes('\\d')) return '10:00';
      return 'x'.repeat(Math.max(s.minLength ?? 1, 2));
    case 'integer':
    case 'number':
      return s.minimum ?? 1;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'null':
      return null;
    default:
      return 'x';
  }
}

type Route = { method: string; path: string; hooks?: { body?: unknown; query?: unknown } };

/** Petición con cuerpo y query válidos según el esquema de la ruta, para que la validación no tape la autorización. */
const call = async (route: Route, path: string, cookie?: string) => {
  const sample = (schema: unknown) => (schema ? (make(schema as Schema) as Record<string, unknown>) : undefined);
  const q = sample(route.hooks?.query);
  const qs = q
    ? '?' +
      new URLSearchParams(
        Object.entries(q)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  const body = sample(route.hooks?.body);
  const r = await fetch(BASE + path + qs, {
    method: route.method,
    headers: { ...H, ...(cookie ? { cookie } : {}) },
    body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? JSON.stringify(body ?? {}) : undefined,
  });
  return r.status;
};

const owner = await signUp('owner');
const outsider = await signUp('outsider');
const instructor = await signUp('instructor');
let orgId = '';
try {
  const created = await fetch(`${BASE}/api/orgs`, {
    method: 'POST',
    headers: { ...H, cookie: owner.cookie },
    body: JSON.stringify({
      name: `ZZ Org ${tag}`,
      type: 'STUDIO',
      address: 'Calle Falsa 123',
      neighborhood: 'Centro',
      city: 'Tepic',
      roomName: 'Sala 1',
      roomCapacity: 10,
    }),
  });
  if (!created.ok) throw new Error(`crear org: ${created.status} ${await created.text()}`);
  orgId = ((await created.json()) as { id: string }).id;
  await db
    .insert(schema.member)
    .values({ id: crypto.randomUUID(), organizationId: orgId, userId: instructor.id, role: 'instructor', createdAt: new Date() } as never);

  // Rutas de la API (sin las de Better Auth, que se montan aparte).
  const routes = (api.routes as Route[]).filter(
    (r) => r.path.startsWith('/api') && !r.path.startsWith('/api/auth') && r.method !== 'ALL' && r.method !== 'OPTIONS'
  );

  const fill = (p: string) => p.replace(/:id\b/g, orgId).replace(/:[A-Za-z]+/g, 'zz-unknown');
  const failures: string[] = [];
  const rows: string[] = [];

  for (const r of routes) {
    const path = fill(r.path);
    const isOrg = r.path.startsWith('/api/orgs/:id');
    console.error('>>', r.method, r.path);
    const anon = await call(r, path);
    const out = await call(r, path, outsider.cookie);
    const inst = await call(r, path, instructor.cookie);
    rows.push(`${r.method.padEnd(6)} ${r.path.padEnd(62)} anónimo ${anon}  ajeno ${out}  instructor ${inst}`);
    // Públicas a propósito: salud (monitores), catálogos /client-errors (la app reporta un fallo aunque no haya sesión; limitada por origen) el webhook de Stripe (se autentica con la firma HMAC del evento) y /jobs/reminders (se autentica con el secreto del planificador, cabecera x-cron-secret).
    const public_ = ['/api/health', '/api', '/api/catalog', '/api/zones', '/api/client-errors', '/api/stripe/connect-webhook', '/api/stripe/return', '/api/jobs/reminders'].includes(r.path) || r.path.startsWith('/api/zones');
    if (!public_ && anon >= 200 && anon < 300) failures.push(`ANÓNIMO accede: ${r.method} ${r.path} → ${anon}`);
    if (isOrg && out >= 200 && out < 300) failures.push(`AJENO accede: ${r.method} ${r.path} → ${out}`);
    if (isOrg && out !== 404 && out !== 422 && out !== 401)
      failures.push(`AJENO sin 404: ${r.method} ${r.path} → ${out} (se esperaba 404; revisar que no filtre existencia)`);
  }

  console.log(rows.join('\n'));
  console.log(`\n${routes.length} rutas revisadas.`);
  if (failures.length) {
    console.log('\nPROBLEMAS:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else console.log('Sin problemas de aislamiento ni de autenticación.');
} catch (e) {
  console.error('ERROR:', e);
  process.exitCode = 1;
} finally {
  const ids = [owner.id, outsider.id, instructor.id];
  // Organizaciones creadas por estas personas (incluidas las que crean las rutas al probarlas).
  const orgIds = (await db.select({ id: schema.member.organizationId }).from(schema.member).where(inArray(schema.member.userId, ids))).map(
    (m) => m.id
  );
  if (orgIds.length) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.organizationId, orgIds));
    await db.delete(schema.organization).where(inArray(schema.organization.id, orgIds));
  }
  await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorUserId, ids));
  await db.delete(schema.user).where(inArray(schema.user.id, ids));
  process.exit(process.exitCode ?? 0);
}
