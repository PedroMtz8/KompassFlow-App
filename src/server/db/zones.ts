import { and, asc, eq } from 'drizzle-orm';

import { db, schema } from './index';

/** Ciudades activas con sus colonias, para los selectores de ubicación. */
export async function listZones() {
  const rows = await db
    .select()
    .from(schema.zone)
    .where(eq(schema.zone.isActive, true))
    .orderBy(asc(schema.zone.sortOrder), asc(schema.zone.name));
  const cities = rows.filter((z) => z.kind === 'CITY');
  return cities.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    state: c.state,
    timezone: c.timezone,
    lat: c.lat,
    lng: c.lng,
    neighborhoods: rows
      .filter((z) => z.kind === 'NEIGHBORHOOD' && z.parentId === c.id)
      .map((z) => ({ id: z.id, slug: z.slug, name: z.name, lat: z.lat, lng: z.lng })),
  }));
}

/** Colonia + su ciudad (para fijar coordenadas, ciudad y zona horaria de una sede). */
export async function getNeighborhood(zoneId: string) {
  const z = await db.query.zone.findFirst({
    where: and(eq(schema.zone.id, zoneId), eq(schema.zone.kind, 'NEIGHBORHOOD'), eq(schema.zone.isActive, true)),
  });
  if (!z?.parentId) return null;
  const city = await db.query.zone.findFirst({ where: eq(schema.zone.id, z.parentId) });
  return city ? { id: z.id, name: z.name, lat: z.lat, lng: z.lng, city: city.name, timezone: city.timezone } : null;
}
