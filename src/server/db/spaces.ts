import { and, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { isUniqueViolation } from '../lib/db-errors';
import { db, schema } from './index';
import { auditStatement } from './organizations';
import { parseMapsUrl } from '../lib/maps';
import { getNeighborhood } from './zones';

const clean = (v: string | undefined | null) => {
  const t = v?.trim();
  return t ? t : null;
};

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Todas las consultas filtran por organización: un id de otra organización simplemente no existe. */
const ownLocation = (organizationId: string, locationId: string) =>
  db.query.location.findFirst({ where: and(eq(schema.location.id, locationId), eq(schema.location.organizationId, organizationId)) });
const ownRoom = (organizationId: string, roomId: string) =>
  db.query.room.findFirst({ where: and(eq(schema.room.id, roomId), eq(schema.room.organizationId, organizationId)) });

export type LocationInput = { address: string; neighborhood?: string; city?: string; zoneId?: string; mapsUrl?: string };

export async function createLocation(userId: string, organizationId: string, input: LocationInput) {
  const zone = input.zoneId ? await getNeighborhood(input.zoneId) : null;
  if (input.zoneId && !zone) return { error: 'ZONE_NOT_AVAILABLE' as const };
  const city = zone?.city ?? input.city?.trim();
  if (!city) return { error: 'CITY_REQUIRED' as const };
  const maps = input.mapsUrl?.trim() ? await parseMapsUrl(input.mapsUrl) : null;
  if (maps && 'error' in maps) return { error: 'INVALID_MAPS_URL' as const };
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(schema.location).values({
      id,
      organizationId,
      address: input.address.trim(),
      neighborhood: clean(input.neighborhood) ?? zone?.name ?? null,
      city,
      zoneId: zone?.id ?? null,
      // Las coordenadas exactas del enlace de Maps son más precisas que el centro de la colonia.
      lat: maps?.lat ?? zone?.lat ?? null,
      lng: maps?.lng ?? zone?.lng ?? null,
      mapsUrl: maps?.url ?? null,
    }),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'location.created',
      entityType: 'location',
      entityId: id,
      metadata: input,
    }),
  ] as Batch);
  return { id };
}

export async function updateLocation(userId: string, organizationId: string, locationId: string, input: Partial<LocationInput>) {
  if (!(await ownLocation(organizationId, locationId))) return { error: 'NOT_FOUND' as const };
  const zone = input.zoneId ? await getNeighborhood(input.zoneId) : null;
  if (input.zoneId && !zone) return { error: 'ZONE_NOT_AVAILABLE' as const };
  const set: Partial<typeof schema.location.$inferInsert> = {};
  if (input.address?.trim()) set.address = input.address.trim();
  if (input.neighborhood !== undefined) set.neighborhood = clean(input.neighborhood);
  if (input.city?.trim()) set.city = input.city.trim();
  if (zone)
    Object.assign(set, {
      zoneId: zone.id,
      lat: zone.lat,
      lng: zone.lng,
      city: zone.city,
      neighborhood: clean(input.neighborhood) ?? zone.name,
    });
  // Enlace de Google Maps: vacío lo quita; si trae coordenadas, reemplazan a las de la colonia.
  if (input.mapsUrl !== undefined) {
    if (!input.mapsUrl.trim()) set.mapsUrl = null;
    else {
      const maps = await parseMapsUrl(input.mapsUrl);
      if ('error' in maps) return { error: 'INVALID_MAPS_URL' as const };
      set.mapsUrl = maps.url;
      if (maps.lat != null && maps.lng != null) Object.assign(set, { lat: maps.lat, lng: maps.lng });
    }
  }
  if (!Object.keys(set).length) return { ok: true as const };
  await db.batch([
    db
      .update(schema.location)
      .set(set)
      .where(and(eq(schema.location.id, locationId), eq(schema.location.organizationId, organizationId))),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'location.updated',
      entityType: 'location',
      entityId: locationId,
      metadata: input,
    }),
  ] as Batch);
  return { ok: true as const };
}

export type RoomInput = { name: string; capacity: number; note?: string };

export async function createRoom(userId: string, organizationId: string, locationId: string, input: RoomInput) {
  if (!(await ownLocation(organizationId, locationId))) return { error: 'NOT_FOUND' as const };
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db
        .insert(schema.room)
        .values({ id, organizationId, locationId, name: input.name.trim(), capacity: input.capacity, note: clean(input.note) }),
      auditStatement({ organizationId, actorUserId: userId, action: 'room.created', entityType: 'room', entityId: id, metadata: input }),
    ] as Batch);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'DUPLICATE_NAME' as const };
    throw e;
  }
  return { id };
}

export async function updateRoom(userId: string, organizationId: string, roomId: string, input: Partial<RoomInput>) {
  if (!(await ownRoom(organizationId, roomId))) return { error: 'NOT_FOUND' as const };
  const set: Partial<typeof schema.room.$inferInsert> = {};
  if (input.name?.trim()) set.name = input.name.trim();
  if (input.capacity !== undefined) set.capacity = input.capacity;
  if (input.note !== undefined) set.note = clean(input.note);
  if (!Object.keys(set).length) return { ok: true as const };
  try {
    await db.batch([
      db
        .update(schema.room)
        .set(set)
        .where(and(eq(schema.room.id, roomId), eq(schema.room.organizationId, organizationId))),
      auditStatement({
        organizationId,
        actorUserId: userId,
        action: 'room.updated',
        entityType: 'room',
        entityId: roomId,
        metadata: input,
      }),
    ] as Batch);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'DUPLICATE_NAME' as const };
    throw e;
  }
  return { ok: true as const };
}

export async function deleteRoom(userId: string, organizationId: string, roomId: string) {
  const r = await ownRoom(organizationId, roomId);
  if (!r) return { error: 'NOT_FOUND' as const };
  await db.batch([
    db.delete(schema.room).where(and(eq(schema.room.id, roomId), eq(schema.room.organizationId, organizationId))),
    auditStatement({
      organizationId,
      actorUserId: userId,
      action: 'room.deleted',
      entityType: 'room',
      entityId: roomId,
      metadata: { name: r.name },
    }),
  ] as Batch);
  return { ok: true as const };
}
