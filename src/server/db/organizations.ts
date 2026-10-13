import { and, asc, count, eq, gt } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { memberAccess, permissionsOf } from '../auth/access';
import type { Resource } from '../auth/permissions';
import { DEFAULT_VERTICAL_SLUG } from './catalog';
import { db, schema } from './index';
import { parseTerms } from './terms';
import { parseMapsUrl } from '../lib/maps';
import { isValidTimeZone } from '../lib/time';
import { getNeighborhood } from './zones';

export type OrgType = 'PERSONAL' | 'STUDIO';

export type CreateOrgInput = {
  name: string;
  type: OrgType;
  /** Si se omite, se usa el rubro por defecto. Debe estar activo. */
  verticalId?: string;
  description?: string;
  phone?: string;
  instagram?: string;
  website?: string;
  timezone?: string;
  currency?: string;
  address: string;
  neighborhood?: string;
  /** Obligatoria salvo que se elija una colonia del catálogo (de ella sale la ciudad). */
  city?: string;
  /** Colonia del catálogo: fija coordenadas, ciudad y zona horaria. */
  zoneId?: string;
  /** Enlace de Google Maps (opcional). Sus coordenadas tienen prioridad sobre las de la colonia. */
  mapsUrl?: string;
  /** Primer espacio (salón, sala, cancha…). */
  roomName: string;
  roomCapacity: number;
};

const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';

const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Registra una operación sensible (PRD regla 5). Va dentro del mismo batch que la operación. */
export function auditStatement(entry: {
  organizationId: string | null;
  /** `null` = lo hizo el sistema (por ejemplo, un aviso de Stripe). */
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}) {
  return db.insert(schema.auditLog).values({
    organizationId: entry.organizationId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
  });
}

/** Rol del usuario en la organización (null si no es miembro). */
export async function getMemberRole(userId: string, organizationId: string) {
  const m = await db.query.member.findFirst({
    where: and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
  });
  return m?.role ?? null;
}

/**
 * Verifica que el usuario sea miembro y tenga permiso. Devuelve el rol o null.
 * Toda ruta con `:id` de organización pasa por aquí: un usuario nunca toca datos de otra (PRD regla 2).
 */
export async function authorize(userId: string, organizationId: string, resource: Resource, action: string) {
  const access = await memberAccess(organizationId, userId);
  return access?.permissions[resource]?.includes(action) ? access.role : null;
}

async function resolveVerticalId(requested: string | undefined) {
  if (requested) {
    const v = await db.query.vertical.findFirst({ where: and(eq(schema.vertical.id, requested), eq(schema.vertical.isActive, true)) });
    return v?.id ?? null;
  }
  const v = await db.query.vertical.findFirst({ where: eq(schema.vertical.slug, DEFAULT_VERTICAL_SLUG) });
  return v?.id ?? null;
}

/** Crea organización + propietario + detalle + sede + primer espacio + auditoría en UNA transacción. */
export async function createOrganization(userId: string, input: CreateOrgInput) {
  const verticalId = await resolveVerticalId(input.verticalId);
  if (!verticalId) return { error: 'VERTICAL_NOT_AVAILABLE' as const };

  const zone = input.zoneId ? await getNeighborhood(input.zoneId) : null;
  if (input.zoneId && !zone) return { error: 'ZONE_NOT_AVAILABLE' as const };
  const city = zone?.city ?? input.city?.trim();
  if (!city) return { error: 'CITY_REQUIRED' as const };
  const maps = input.mapsUrl?.trim() ? await parseMapsUrl(input.mapsUrl) : null;
  if (maps && 'error' in maps) return { error: 'INVALID_MAPS_URL' as const };
  if (input.timezone && !isValidTimeZone(input.timezone)) return { error: 'INVALID_TIMEZONE' as const };

  const organizationId = crypto.randomUUID();
  const locationId = crypto.randomUUID();
  const roomId = crypto.randomUUID();
  const slug = `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const now = new Date();

  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.organization).values({ id: organizationId, name: input.name.trim(), slug, createdAt: now }),
    db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId, userId, role: 'owner', createdAt: now }),
    db.insert(schema.organizationDetail).values({
      organizationId,
      type: input.type,
      verticalId,
      description: clean(input.description),
      phone: clean(input.phone),
      instagram: clean(input.instagram),
      website: clean(input.website),
      timezone: input.timezone || zone?.timezone || 'America/Mexico_City',
      currency: input.currency || 'MXN',
      // Nace oculta: para salir en Descubrir debe completar su perfil y que la plataforma verifique que existe (db/verification.ts).
      isPublished: false,
      verificationStatus: 'NONE',
    }),
    db.insert(schema.location).values({
      id: locationId,
      organizationId,
      address: input.address.trim(),
      neighborhood: clean(input.neighborhood) ?? zone?.name ?? null,
      city,
      zoneId: zone?.id ?? null,
      mapsUrl: maps?.url ?? null,
      lat: maps?.lat ?? zone?.lat ?? null,
      lng: maps?.lng ?? zone?.lng ?? null,
      isPrimary: true,
    }),
    db.insert(schema.room).values({ id: roomId, organizationId, locationId, name: input.roomName.trim(), capacity: input.roomCapacity }),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { type: input.type, verticalId },
    }),
  ];
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { id: organizationId };
}

/** Organizaciones a las que pertenece el usuario, con su rol y rubro. */
export async function listMyOrganizations(userId: string) {
  const rows = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      role: schema.member.role,
      type: schema.organizationDetail.type,
      coverImage: schema.organizationDetail.coverImage,
      logo: schema.organization.logo,
      verticalId: schema.vertical.id,
      verticalSlug: schema.vertical.slug,
      verticalName: schema.vertical.name,
      terms: schema.vertical.terms,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .innerJoin(schema.vertical, eq(schema.vertical.id, schema.organizationDetail.verticalId))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.organization.name));
  // Permisos efectivos de la persona en cada academia (roles del sistema y personalizados): la interfaz los usa para mostrar u ocultar acciones.
  return Promise.all(rows.map(async (r) => ({ ...r, terms: parseTerms(r.terms), permissions: (await memberAccess(r.id, userId))?.permissions ?? (await permissionsOf(r.id, r.role)) })));
}

export async function getOrganizationDetail(organizationId: string) {
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  if (!org) return null;
  const detail = await db.query.organizationDetail.findFirst({
    where: eq(schema.organizationDetail.organizationId, organizationId),
    with: { vertical: true },
  });
  if (!detail) return null;
  const locations = await db.query.location.findMany({
    where: eq(schema.location.organizationId, organizationId),
    with: { rooms: true },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    type: detail.type,
    description: detail.description,
    phone: detail.phone,
    instagram: detail.instagram,
    website: detail.website,
    coverImage: detail.coverImage,
    logo: org.logo,
    timezone: detail.timezone,
    currency: detail.currency,
    isPublished: detail.isPublished,
    verificationStatus: detail.verificationStatus,
    cancelWindowHours: detail.cancelWindowHours,
    vertical: { id: detail.vertical.id, slug: detail.vertical.slug, name: detail.vertical.name, terms: parseTerms(detail.vertical.terms) },
    locations: locations.map((l) => ({
      id: l.id,
      address: l.address,
      neighborhood: l.neighborhood,
      city: l.city,
      zoneId: l.zoneId,
      mapsUrl: l.mapsUrl,
      lat: l.lat,
      lng: l.lng,
      isPrimary: l.isPrimary,
      rooms: l.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, note: r.note })),
    })),
  };
}

export type UpdateOrgInput = Partial<
  Pick<CreateOrgInput, 'name' | 'description' | 'phone' | 'instagram' | 'website' | 'timezone' | 'currency'>
> & {
  isPublished?: boolean;
  cancelWindowHours?: number;
};

export async function updateOrganization(userId: string, organizationId: string, input: UpdateOrgInput) {
  if (input.isPublished) {
    // Solo una organización verificada puede mostrarse; ocultarse siempre se puede.
    const v = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
    if (v?.verificationStatus !== 'APPROVED') return { error: 'NOT_VERIFIED' as const };
  }
  if (input.timezone) {
    if (!isValidTimeZone(input.timezone)) return { error: 'INVALID_TIMEZONE' as const };
    const current = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
    if (current && current.timezone !== input.timezone) {
      // Las clases se guardan como instantes fijos: cambiar la zona movería su hora local. Se exige empezar en limpio.
      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.classSession)
        .where(
          and(
            eq(schema.classSession.organizationId, organizationId),
            eq(schema.classSession.status, 'SCHEDULED'),
            gt(schema.classSession.startsAt, new Date())
          )
        );
      if (n > 0) return { error: 'TIMEZONE_HAS_SESSIONS' as const, upcoming: n };
    }
  }
  const statements: BatchItem<'sqlite'>[] = [];
  if (input.name?.trim()) {
    statements.push(db.update(schema.organization).set({ name: input.name.trim() }).where(eq(schema.organization.id, organizationId)));
  }
  const detail: Record<string, string | null> = {};
  for (const k of ['description', 'phone', 'instagram', 'website'] as const) if (input[k] !== undefined) detail[k] = clean(input[k]);
  if (input.timezone) detail.timezone = input.timezone;
  if (input.currency) detail.currency = input.currency;
  const flags: Record<string, boolean | number> = {};
  if (input.isPublished !== undefined) flags.isPublished = input.isPublished;
  if (input.cancelWindowHours !== undefined) flags.cancelWindowHours = input.cancelWindowHours;
  if (Object.keys(detail).length || Object.keys(flags).length) {
    statements.push(
      db
        .update(schema.organizationDetail)
        .set({ ...detail, ...flags })
        .where(eq(schema.organizationDetail.organizationId, organizationId))
    );
  }
  if (!statements.length) return { ok: true as const };
  statements.push(
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: organizationId,
      metadata: input,
    })
  );
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { ok: true as const };
}
