import { and, count, eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { roles as systemRoles, statements } from './permissions';

/**
 * Evaluación de permisos con roles del sistema (en código) y roles personalizados (tabla `organization_role`).
 * `member.role` guarda el nombre del rol; puede venir con varios separados por coma (el plugin lo permite).
 * Todo lo que decide qué se puede hacer pasa por aquí: el servidor es la única fuente de verdad.
 */
export type Permissions = Record<string, string[]>;

/** Roles que vienen con la plataforma. No se pueden editar ni borrar; el nombre queda reservado. */
export const SYSTEM_ROLE_NAMES = Object.keys(systemRoles) as (keyof typeof systemRoles)[];
/** Nombres que un rol personalizado no puede usar (los del sistema y el rol por defecto del plugin). */
export const RESERVED_ROLE_NAMES = [...SYSTEM_ROLE_NAMES, 'member'];

const systemPerms = (name: string): Permissions | null => {
  const r = (systemRoles as Record<string, { statements: Record<string, readonly string[]> }>)[name];
  return r ? Object.fromEntries(Object.entries(r.statements).map(([k, v]) => [k, [...v]])) : null;
};

// Caché corto por organización: la autorización corre en cada petición y los roles cambian muy poco.
type CacheEntry = { at: number; roles: Map<string, Permissions> };
const TTL_MS = 10_000;
const cache = ((globalThis as { __orgRoles?: Map<string, CacheEntry> }).__orgRoles ??= new Map());

/** Los roles personalizados de la organización, con sus permisos. */
export async function customRoles(organizationId: string): Promise<Map<string, Permissions>> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roles;
  const rows = await db.select().from(schema.organizationRole).where(eq(schema.organizationRole.organizationId, organizationId));
  const roles = new Map<string, Permissions>();
  for (const r of rows) {
    try {
      roles.set(r.role, JSON.parse(r.permission) as Permissions);
    } catch {
      roles.set(r.role, {});
    }
  }
  cache.set(organizationId, { at: Date.now(), roles });
  return roles;
}

/** Descarta el caché de la organización (tras crear, editar o borrar un rol). */
export function invalidateRoles(organizationId: string) {
  cache.delete(organizationId);
}

/** Permisos efectivos de un rol (o de varios separados por coma: se unen). Un rol desconocido no puede nada. */
export async function permissionsOf(organizationId: string, roleString: string | null | undefined): Promise<Permissions> {
  const out: Permissions = {};
  if (!roleString) return out;
  const custom = await customRoles(organizationId);
  for (const name of roleString.split(',').map((n) => n.trim()).filter(Boolean)) {
    const perms = systemPerms(name) ?? custom.get(name);
    if (!perms) continue;
    for (const [res, actions] of Object.entries(perms)) out[res] = [...new Set([...(out[res] ?? []), ...actions])];
  }
  return out;
}

const parse = (json: string | null | undefined): Permissions => {
  try {
    return json ? (JSON.parse(json) as Permissions) : {};
  } catch {
    return {};
  }
};

const union = (a: Permissions, b: Permissions): Permissions => {
  const out: Permissions = { ...a };
  for (const [res, actions] of Object.entries(b)) out[res] = [...new Set([...(out[res] ?? []), ...actions])];
  return out;
};

/**
 * La persona dentro de la organización: su rol, lo extra que se le dio (`member_extra_permission`) y sus permisos
 * efectivos (rol + extras). Es lo que debe usarse para autorizar: el rol solo no basta si tiene permisos adicionales.
 */
export async function memberAccess(organizationId: string, userId: string) {
  const [row] = await db
    .select({ memberId: schema.member.id, role: schema.member.role, extra: schema.memberExtraPermission.permission })
    .from(schema.member)
    .leftJoin(schema.memberExtraPermission, eq(schema.memberExtraPermission.memberId, schema.member.id))
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
    .limit(1);
  if (!row) return null;
  const extra = parse(row.extra);
  return { memberId: row.memberId, role: row.role, extra, permissions: union(await permissionsOf(organizationId, row.role), extra) };
}

/** ¿Esta persona puede hacer `action` sobre `resource` en la organización (rol + permisos adicionales)? */
export async function userCan(organizationId: string, userId: string, resource: string, action: string) {
  return !!(await memberAccess(organizationId, userId))?.permissions[resource]?.includes(action);
}

/** Personas que imparten clases: las de un rol con `session:teach` y las que lo tienen como permiso adicional. */
export async function teachingUserIds(organizationId: string): Promise<string[]> {
  const byRole = await rolesWith(organizationId, 'session', 'teach');
  const rows = await db
    .select({ userId: schema.member.userId, role: schema.member.role, extra: schema.memberExtraPermission.permission })
    .from(schema.member)
    .leftJoin(schema.memberExtraPermission, eq(schema.memberExtraPermission.memberId, schema.member.id))
    .where(eq(schema.member.organizationId, organizationId));
  return rows.filter((r) => byRole.includes(r.role) || parse(r.extra).session?.includes('teach')).map((r) => r.userId);
}

export async function can(organizationId: string, roleString: string | null | undefined, resource: string, action: string) {
  return !!(await permissionsOf(organizationId, roleString))[resource]?.includes(action);
}

/** Nombres de los roles (del sistema y personalizados) que tienen `resource:action`. Sirve para filtrar miembros en SQL. */
export async function rolesWith(organizationId: string, resource: string, action: string): Promise<string[]> {
  const custom = await customRoles(organizationId);
  const names: string[] = SYSTEM_ROLE_NAMES.filter((n) => systemPerms(n)?.[resource]?.includes(action));
  for (const [name, perms] of custom) if (perms[resource]?.includes(action)) names.push(name);
  return names;
}

/** ¿Todo lo que concede `wanted` también lo tiene `held`? Nadie puede dar permisos que no tiene. */
export function isSubset(wanted: Permissions, held: Permissions) {
  return Object.entries(wanted).every(([res, actions]) => actions.every((a) => held[res]?.includes(a)));
}

/** Quita lo que no existe en el catálogo (recursos o acciones inventadas) y los arreglos vacíos. */
export function sanitizePermissions(input: Record<string, readonly string[]>): Permissions {
  const catalog = statements as Record<string, readonly string[]>;
  const out: Permissions = {};
  for (const [res, actions] of Object.entries(input)) {
    const valid = (catalog[res] ?? []) as readonly string[];
    const kept = [...new Set(actions)].filter((a) => valid.includes(a));
    if (kept.length) out[res] = kept;
  }
  return out;
}

/** Cuántos miembros e invitaciones pendientes usan este rol (para impedir borrar un rol en uso). */
export async function roleUsage(organizationId: string, role: string) {
  const [[m], [i]] = await Promise.all([
    db.select({ n: count() }).from(schema.member).where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, role))),
    db
      .select({ n: count() })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, organizationId), eq(schema.invitation.role, role), eq(schema.invitation.status, 'pending'))),
  ]);
  return { members: m.n, invitations: i.n };
}
