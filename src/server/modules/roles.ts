import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { auth } from '../auth';
import { customRoles, invalidateRoles, isSubset, memberAccess, permissionsOf, RESERVED_ROLE_NAMES, roleUsage, sanitizePermissions, SYSTEM_ROLE_NAMES } from '../auth/access';
import { authPlugin } from '../auth/plugin';
import { permissionCatalog, SYSTEM_ROLE_INFO } from '../auth/role-catalog';
import { db, schema } from '../db';
import { authorize, auditStatement, getMemberRole } from '../db/organizations';
import { allow } from '../lib/rate-limit';

const MAX_CUSTOM_ROLES = 20;
/** El plugin guarda el nombre del rol en minúsculas: ese es su identificador; en pantalla se muestra con mayúscula inicial. */
const labelOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._+-]{1,38}[\p{L}\p{N}.]$/u;

const permissionsBody = t.Record(t.String({ maxLength: 40 }), t.Array(t.String({ maxLength: 40 }), { maxItems: 20 }), { maxProperties: 30 });

/** Traduce el error del plugin a un mensaje útil (y un código HTTP razonable). */
function pluginError(e: unknown): { code: 400 | 403 | 404 | 409; message: string } {
  const body = (e as { body?: { code?: string; message?: string } }).body;
  switch (body?.code) {
    case 'TOO_MANY_ROLES':
      return { code: 409, message: `Llegaste al máximo de ${MAX_CUSTOM_ROLES} roles personalizados.` };
    case 'ROLE_NAME_IS_ALREADY_TAKEN':
      return { code: 409, message: 'Ya existe un rol con ese nombre.' };
    case 'ROLE_IS_ASSIGNED_TO_MEMBERS':
      return { code: 409, message: 'Hay personas con este rol. Cámbiales el rol primero.' };
    case 'ROLE_NOT_FOUND':
      return { code: 404, message: 'No encontramos ese rol.' };
    case 'CANNOT_DELETE_A_PRE_DEFINED_ROLE':
      return { code: 403, message: 'Los roles del sistema no se pueden borrar.' };
    default:
      if (/not allowed|permission|forbidden/i.test(body?.message ?? '')) return { code: 403, message: 'No puedes dar permisos que tú no tienes.' };
      return { code: 400, message: 'No se pudo guardar el rol.' };
  }
}

/** Roles y permisos de una organización: los del sistema (fijos) y los que la academia crea a su medida. */
export const rolesModule = new Elysia({ name: 'roles' })
  .use(authPlugin)
  .get(
    '/orgs/:id/roles',
    async ({ user, params, status }) => {
      const myRole = await getMemberRole(user.id, params.id);
      if (!myRole) return status(404, { message: 'No encontrada' });
      const custom = await customRoles(params.id);
      const usage = async (name: string) => roleUsage(params.id, name);
      const system = await Promise.all(
        SYSTEM_ROLE_NAMES.map(async (name) => ({
          id: name as string,
          label: SYSTEM_ROLE_INFO[name]?.label ?? name,
          description: SYSTEM_ROLE_INFO[name]?.description ?? '',
          system: true,
          permissions: await permissionsOf(params.id, name),
          ...(await usage(name)),
        }))
      );
      const mine = await Promise.all(
        [...custom.entries()].map(async ([name, permissions]) => ({
          id: name,
          label: labelOf(name),
          description: '',
          system: false,
          permissions,
          ...(await usage(name)),
        }))
      );
      return {
        catalog: permissionCatalog(),
        roles: [...system, ...mine.sort((a, b) => a.label.localeCompare(b.label))],
        maxCustom: MAX_CUSTOM_ROLES,
        canManage: await authorize(user.id, params.id, 'ac', 'create').then(Boolean),
      };
    },
    { auth: true }
  )
  .post(
    '/orgs/:id/roles',
    async ({ user, params, body, request, status }) => {
      const myRole = await getMemberRole(user.id, params.id);
      if (!myRole) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'ac', 'create'))) return status(403, { message: 'No tienes permiso para crear roles.' });
      if (!await allow(`roles:${user.id}`, 60, 10 * 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const name = body.name.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!NAME.test(name)) return status(422, { message: 'El nombre debe tener entre 3 y 40 letras o números (sin comas).' });
      if (RESERVED_ROLE_NAMES.some((r) => r.toLowerCase() === name.toLowerCase()) || Object.values(SYSTEM_ROLE_INFO).some((i) => i.label.toLowerCase() === name.toLowerCase()))
        return status(409, { message: 'Ese nombre está reservado para un rol del sistema.' });
      const permission = sanitizePermissions(body.permissions);
      if (!Object.keys(permission).length) return status(422, { message: 'Elige al menos un permiso.' });
      if (myRole !== 'owner' && !isSubset(permission, (await memberAccess(params.id, user.id))?.permissions ?? {}))
        return status(403, { message: 'No puedes dar permisos que tú no tienes.' });
      try {
        await auth.api.createOrgRole({ body: { role: name, permission, organizationId: params.id }, headers: request.headers });
      } catch (e) {
        const err = pluginError(e);
        return status(err.code, { message: err.message });
      }
      invalidateRoles(params.id);
      await auditStatement({ organizationId: params.id, actorUserId: user.id, action: 'role.created', entityType: 'role', entityId: name, metadata: { permission } });
      return { id: name };
    },
    { auth: true, body: t.Object({ name: t.String({ minLength: 1, maxLength: 60 }), permissions: permissionsBody }) }
  )
  .patch(
    '/orgs/:id/roles/:role',
    async ({ user, params, body, request, status }) => {
      const myRole = await getMemberRole(user.id, params.id);
      if (!myRole) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'ac', 'update'))) return status(403, { message: 'No tienes permiso para editar roles.' });
      if (!await allow(`roles:${user.id}`, 60, 10 * 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const role = decodeURIComponent(params.role).toLowerCase();
      if (RESERVED_ROLE_NAMES.includes(role)) return status(403, { message: 'Los roles del sistema no se pueden editar.' });
      if (!(await customRoles(params.id)).has(role)) return status(404, { message: 'No encontramos ese rol.' });
      const permission = sanitizePermissions(body.permissions);
      if (!Object.keys(permission).length) return status(422, { message: 'Elige al menos un permiso.' });
      if (myRole !== 'owner' && !isSubset(permission, (await memberAccess(params.id, user.id))?.permissions ?? {}))
        return status(403, { message: 'No puedes dar permisos que tú no tienes.' });
      try {
        await auth.api.updateOrgRole({ body: { roleName: role, organizationId: params.id, data: { permission } }, headers: request.headers });
      } catch (e) {
        const err = pluginError(e);
        return status(err.code, { message: err.message });
      }
      invalidateRoles(params.id);
      await auditStatement({ organizationId: params.id, actorUserId: user.id, action: 'role.updated', entityType: 'role', entityId: role, metadata: { permission } });
      return { ok: true as const };
    },
    { auth: true, body: t.Object({ permissions: permissionsBody }) }
  )
  .delete(
    '/orgs/:id/roles/:role',
    async ({ user, params, request, status }) => {
      const myRole = await getMemberRole(user.id, params.id);
      if (!myRole) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'ac', 'delete'))) return status(403, { message: 'No tienes permiso para borrar roles.' });
      const role = decodeURIComponent(params.role).toLowerCase();
      if (RESERVED_ROLE_NAMES.includes(role)) return status(403, { message: 'Los roles del sistema no se pueden borrar.' });
      if (!(await customRoles(params.id)).has(role)) return status(404, { message: 'No encontramos ese rol.' });
      const use = await roleUsage(params.id, role);
      if (use.members) return status(409, { message: 'Hay personas con este rol. Cámbiales el rol primero.' });
      if (use.invitations) return status(409, { message: 'Hay invitaciones pendientes con este rol. Cancélalas primero.' });
      try {
        await auth.api.deleteOrgRole({ body: { roleName: role, organizationId: params.id }, headers: request.headers });
      } catch (e) {
        const err = pluginError(e);
        return status(err.code, { message: err.message });
      }
      invalidateRoles(params.id);
      await auditStatement({ organizationId: params.id, actorUserId: user.id, action: 'role.deleted', entityType: 'role', entityId: role });
      return { ok: true as const };
    },
    { auth: true }
  )
  /**
   * Permisos adicionales de UNA persona sobre su rol (p. ej. «instructor + ver reportes»).
   *  - Sin `template`: se guardan solo para esa persona; el rol sigue siendo el mismo (y si el rol cambia, se vuelven a calcular).
   *  - Con `template`: además se crea un rol reutilizable (copia del rol actual + lo adicional) y se le asigna a la persona.
   * `permissions` es TODO lo adicional que debe quedar (lo ya guardado más lo nuevo); vacío quita los adicionales.
   */
  .put(
    '/orgs/:id/members/:memberId/extra-permissions',
    async ({ user, params, body, request, status }) => {
      const actor = await memberAccess(params.id, user.id);
      if (!actor) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'member', 'update'))) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`roles:${user.id}`, 60, 10 * 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento.' });
      const target = await db.query.member.findFirst({
        where: and(eq(schema.member.id, params.memberId), eq(schema.member.organizationId, params.id)),
      });
      if (!target) return status(404, { message: 'No encontrada' });
      if (target.role === 'owner') return status(403, { message: 'El propietario ya tiene todos los permisos.' });
      if (target.userId === user.id) return status(403, { message: 'No puedes cambiar tus propios permisos.' });
      if (target.role === 'admin' && actor.role !== 'owner') return status(403, { message: 'Solo el propietario puede cambiar a un administrador.' });

      // Solo lo que el rol NO da ya: así lo adicional es realmente adicional y no se duplica.
      const base = await permissionsOf(params.id, target.role);
      const wanted = sanitizePermissions(body.permissions);
      const delta: Record<string, string[]> = {};
      for (const [res, actions] of Object.entries(wanted)) {
        const extra = actions.filter((a) => !base[res]?.includes(a));
        if (extra.length) delta[res] = extra;
      }
      if (actor.role !== 'owner' && !isSubset(delta, actor.permissions))
        return status(403, { message: 'No puedes dar permisos que tú no tienes.' });

      if (body.template) {
        if (!Object.keys(delta).length) return status(422, { message: 'Elige al menos un permiso adicional.' });
        if (!(await authorize(user.id, params.id, 'ac', 'create'))) return status(403, { message: 'No tienes permiso para crear roles.' });
        const name = body.template.name.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!NAME.test(name)) return status(422, { message: 'El nombre debe tener entre 3 y 40 letras o números (sin comas).' });
        if (RESERVED_ROLE_NAMES.some((r) => r === name) || Object.values(SYSTEM_ROLE_INFO).some((i) => i.label.toLowerCase() === name))
          return status(409, { message: 'Ese nombre está reservado para un rol del sistema.' });
        const full = Object.fromEntries(
          [...new Set([...Object.keys(base), ...Object.keys(delta)])].map((r) => [r, [...new Set([...(base[r] ?? []), ...(delta[r] ?? [])])]])
        );
        try {
          await auth.api.createOrgRole({ body: { role: name, permission: full, organizationId: params.id }, headers: request.headers });
        } catch (e) {
          const err = pluginError(e);
          return status(err.code, { message: err.message });
        }
        invalidateRoles(params.id);
        await db.batch([
          db.update(schema.member).set({ role: name }).where(eq(schema.member.id, target.id)),
          db.delete(schema.memberExtraPermission).where(eq(schema.memberExtraPermission.memberId, target.id)),
        ]);
        await auditStatement({
          organizationId: params.id,
          actorUserId: user.id,
          action: 'member.role_from_template',
          entityType: 'member',
          entityId: target.id,
          metadata: { from: target.role, to: name, extra: delta },
        });
        return { ok: true as const, role: name, template: true as const };
      }

      if (!Object.keys(delta).length) {
        await db.delete(schema.memberExtraPermission).where(eq(schema.memberExtraPermission.memberId, target.id));
      } else {
        const permission = JSON.stringify(delta);
        await db
          .insert(schema.memberExtraPermission)
          .values({ memberId: target.id, organizationId: params.id, permission, updatedBy: user.id })
          .onConflictDoUpdate({ target: schema.memberExtraPermission.memberId, set: { permission, updatedBy: user.id, updatedAt: new Date() } });
      }
      await auditStatement({
        organizationId: params.id,
        actorUserId: user.id,
        action: 'member.extra_permissions_set',
        entityType: 'member',
        entityId: target.id,
        metadata: { role: target.role, extra: delta },
      });
      return { ok: true as const, role: target.role, template: false as const };
    },
    {
      auth: true,
      body: t.Object({
        permissions: permissionsBody,
        template: t.Optional(t.Object({ name: t.String({ minLength: 1, maxLength: 60 }) })),
      }),
    }
  );
