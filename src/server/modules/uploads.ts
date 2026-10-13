import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { db, schema } from '../db';
import { auditStatement, authorize, getMemberRole } from '../db/organizations';
import { allow } from '../lib/rate-limit';
import { MAX_IMAGE_BYTES, deleteByUrl, extensionOf, putObject, sniffImage, storageEnabled } from '../lib/storage';

const file = t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: MAX_IMAGE_BYTES });

/** Valida el archivo (tamaño y tipo real) y lo sube. Devuelve la URL o un error ya con su código HTTP. */
async function storeImage(f: File, keyPrefix: string) {
  if (!storageEnabled()) return { code: 503 as const, message: 'El almacenamiento de archivos aún no está configurado.' };
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return { code: 413 as const, message: 'La imagen pesa más de 5 MB.' };
  const type = sniffImage(bytes);
  if (!type) return { code: 415 as const, message: 'Usa una imagen JPG, PNG o WebP.' };
  const url = await putObject(`${keyPrefix}-${crypto.randomUUID()}.${extensionOf(type)}`, bytes, type);
  return { url };
}

/** Foto de perfil del proveedor (claim `picture` del id token de Google), o `null`. */
function pictureFromIdToken(idToken: string | null | undefined) {
  try {
    const payload = JSON.parse(atob(idToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { picture?: string };
    return typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null;
  } catch {
    return null;
  }
}

const TOO_MANY = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';

/** Portada de la academia y foto de perfil. */
export const uploadsModule = new Elysia({ name: 'uploads' })
  .use(authPlugin)
  .get('/storage', () => ({ enabled: storageEnabled() }), { auth: true })
  .post(
    '/orgs/:id/cover',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update'))) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`upload:${user.id}`, 15, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await storeImage(body.file, `orgs/${params.id}/cover`);
      if (!('url' in r)) return status(r.code, { message: r.message });
      const prev = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, params.id) });
      await db.batch([
        db.update(schema.organizationDetail).set({ coverImage: r.url }).where(eq(schema.organizationDetail.organizationId, params.id)),
        auditStatement({
          organizationId: params.id,
          actorUserId: user.id,
          action: 'organization.cover_changed',
          entityType: 'organization',
          entityId: params.id,
        }),
      ]);
      await deleteByUrl(prev?.coverImage);
      return { url: r.url };
    },
    { auth: true, body: t.Object({ file }) }
  )
  .delete(
    '/orgs/:id/cover',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const prev = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, params.id) });
      await db.batch([
        db.update(schema.organizationDetail).set({ coverImage: null }).where(eq(schema.organizationDetail.organizationId, params.id)),
        auditStatement({
          organizationId: params.id,
          actorUserId: user.id,
          action: 'organization.cover_removed',
          entityType: 'organization',
          entityId: params.id,
        }),
      ]);
      await deleteByUrl(prev?.coverImage);
      return { ok: true as const };
    },
    { auth: true }
  )
  .post(
    '/orgs/:id/logo',
    async ({ user, params, body, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update'))) return status(403, { message: 'No tienes permiso.' });
      if (!await allow(`upload:${user.id}`, 15, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await storeImage(body.file, `orgs/${params.id}/logo`);
      if (!('url' in r)) return status(r.code, { message: r.message });
      const prev = await db.query.organization.findFirst({ where: eq(schema.organization.id, params.id) });
      await db.batch([
        db.update(schema.organization).set({ logo: r.url }).where(eq(schema.organization.id, params.id)),
        auditStatement({
          organizationId: params.id,
          actorUserId: user.id,
          action: 'organization.logo_changed',
          entityType: 'organization',
          entityId: params.id,
        }),
      ]);
      await deleteByUrl(prev?.logo);
      return { url: r.url };
    },
    { auth: true, body: t.Object({ file }) }
  )
  .delete(
    '/orgs/:id/logo',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'organization', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const prev = await db.query.organization.findFirst({ where: eq(schema.organization.id, params.id) });
      await db.batch([
        db.update(schema.organization).set({ logo: null }).where(eq(schema.organization.id, params.id)),
        auditStatement({
          organizationId: params.id,
          actorUserId: user.id,
          action: 'organization.logo_removed',
          entityType: 'organization',
          entityId: params.id,
        }),
      ]);
      await deleteByUrl(prev?.logo);
      return { ok: true as const };
    },
    { auth: true }
  )
  .post(
    '/me/avatar',
    async ({ user, body, status }) => {
      if (!await allow(`upload:${user.id}`, 15, 10 * 60_000)) return status(429, { message: TOO_MANY });
      const r = await storeImage(body.file, `users/${user.id}/avatar`);
      if (!('url' in r)) return status(r.code, { message: r.message });
      const prev = await db.query.user.findFirst({ where: eq(schema.user.id, user.id) });
      await db.update(schema.user).set({ image: r.url, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
      await deleteByUrl(prev?.image);
      return { url: r.url };
    },
    { auth: true, body: t.Object({ file }) }
  )
  .delete(
    '/me/avatar',
    async ({ user }) => {
      const prev = await db.query.user.findFirst({ where: eq(schema.user.id, user.id) });
      // Se vuelve a la foto con la que la persona entró (la de Google, si usó Google); si no hay, quedan las iniciales.
      const google = await db.query.account.findFirst({
        where: and(eq(schema.account.userId, user.id), eq(schema.account.providerId, 'google')),
      });
      const original = pictureFromIdToken(google?.idToken);
      await db.update(schema.user).set({ image: original, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
      await deleteByUrl(prev?.image);
      return { url: original };
    },
    { auth: true }
  );
