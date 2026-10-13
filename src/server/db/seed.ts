/**
 * Siembra idempotente del catálogo de rubros. Se puede correr las veces que haga falta:
 *   bun run db:seed
 * Solo Baile está activo; los demás aparecen como "Próximamente" hasta que se active `is_active`.
 */
import { eq } from 'drizzle-orm';

import { db, schema } from './index';

type Terms = { room: string; rooms: string; instructor: string; instructors: string; session: string };
type SeedVertical = { slug: string; name: string; isActive: boolean; terms: Terms; disciplines: { slug: string; name: string }[] };

export const catalogSeed: SeedVertical[] = [
  {
    slug: 'baile',
    name: 'Baile',
    isActive: true,
    terms: { room: 'Salón', rooms: 'Salones', instructor: 'Instructor', instructors: 'Instructores', session: 'Clase' },
    disciplines: [
      { slug: 'bachata', name: 'Bachata' },
      { slug: 'salsa', name: 'Salsa' },
      { slug: 'kizomba', name: 'Kizomba' },
      { slug: 'tango', name: 'Tango' },
      { slug: 'cumbia', name: 'Cumbia' },
      { slug: 'hip-hop', name: 'Hip hop' },
      { slug: 'ballet', name: 'Ballet' },
      { slug: 'contemporaneo', name: 'Contemporáneo' },
      { slug: 'swing', name: 'Swing' },
    ],
  },
  {
    slug: 'fitness',
    name: 'Fitness / Gyms',
    isActive: false,
    terms: { room: 'Sala', rooms: 'Salas', instructor: 'Coach', instructors: 'Coaches', session: 'Clase' },
    disciplines: [
      { slug: 'gym', name: 'Gym' },
      { slug: 'box', name: 'Box' },
      { slug: 'calistenia', name: 'Calistenia' },
      { slug: 'crossfit', name: 'CrossFit' },
      { slug: 'yoga', name: 'Yoga' },
    ],
  },
  {
    slug: 'deportes',
    name: 'Deportes',
    isActive: false,
    terms: { room: 'Cancha', rooms: 'Canchas', instructor: 'Entrenador', instructors: 'Entrenadores', session: 'Entrenamiento' },
    disciplines: [
      { slug: 'futbol', name: 'Fútbol' },
      { slug: 'basquetbol', name: 'Basquetbol' },
      { slug: 'voleibol', name: 'Voleibol' },
      { slug: 'natacion', name: 'Natación' },
    ],
  },
  {
    slug: 'escuelas-privadas',
    name: 'Escuelas privadas',
    isActive: false,
    terms: { room: 'Aula', rooms: 'Aulas', instructor: 'Profesor', instructors: 'Profesores', session: 'Clase' },
    disciplines: [],
  },
];

export async function seedCatalog() {
  for (const [vi, v] of catalogSeed.entries()) {
    await db
      .insert(schema.vertical)
      .values({ slug: v.slug, name: v.name, isActive: v.isActive, sortOrder: vi, terms: JSON.stringify(v.terms) })
      .onConflictDoUpdate({ target: schema.vertical.slug, set: { name: v.name, sortOrder: vi, terms: JSON.stringify(v.terms) } });
    const row = await db.query.vertical.findFirst({ where: eq(schema.vertical.slug, v.slug) });
    if (!row) continue;
    for (const [di, d] of v.disciplines.entries()) {
      await db
        .insert(schema.discipline)
        .values({ verticalId: row.id, slug: d.slug, name: d.name, sortOrder: di })
        .onConflictDoUpdate({
          target: [schema.discipline.verticalId, schema.discipline.slug],
          set: { name: d.name, sortOrder: di },
        });
    }
  }
}

type SeedZone = { slug: string; name: string; lat: number; lng: number };

/**
 * Tepic, Nayarit. Zona Pacífico (UTC-7, sin horario de verano) => America/Mazatlan.
 * OJO: las coordenadas son APROXIMADAS (centro de cada colonia, ±1 km). Sirven para ordenar por
 * cercanía en desarrollo; se reemplazan por geocodificación real de la dirección de cada sede.
 */
export const zonesSeed = {
  city: { slug: 'tepic', name: 'Tepic', state: 'Nayarit', lat: 21.5042, lng: -104.8946, timezone: 'America/Mazatlan' },
  neighborhoods: [
    { slug: 'tepic-centro', name: 'Centro', lat: 21.5042, lng: -104.8946 },
    { slug: 'tepic-mololoa', name: 'Mololoa', lat: 21.5098, lng: -104.9003 },
    { slug: 'tepic-lindavista', name: 'Lindavista', lat: 21.4987, lng: -104.8867 },
    { slug: 'tepic-menchaca', name: 'Menchaca', lat: 21.5161, lng: -104.8879 },
    { slug: 'tepic-ciudad-del-valle', name: 'Ciudad del Valle', lat: 21.4789, lng: -104.8628 },
    { slug: 'tepic-lomas-verdes', name: 'Lomas Verdes', lat: 21.4951, lng: -104.8792 },
    { slug: 'tepic-fray-junipero-serra', name: 'Fray Junípero Serra', lat: 21.4906, lng: -104.8735 },
    { slug: 'tepic-villas-de-la-loma', name: 'Villas de la Loma', lat: 21.4868, lng: -104.8811 },
    { slug: 'tepic-versalles', name: 'Versalles', lat: 21.4934, lng: -104.9021 },
    { slug: 'tepic-los-fresnos', name: 'Los Fresnos', lat: 21.4853, lng: -104.9052 },
  ] satisfies SeedZone[],
};

export async function seedZones() {
  const { city, neighborhoods } = zonesSeed;
  await db
    .insert(schema.zone)
    .values({
      slug: city.slug,
      name: city.name,
      kind: 'CITY',
      state: city.state,
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: schema.zone.slug,
      set: { name: city.name, state: city.state, lat: city.lat, lng: city.lng, timezone: city.timezone },
    });
  const parent = await db.query.zone.findFirst({ where: eq(schema.zone.slug, city.slug) });
  if (!parent) return;
  for (const [i, n] of neighborhoods.entries()) {
    await db
      .insert(schema.zone)
      .values({
        slug: n.slug,
        name: n.name,
        kind: 'NEIGHBORHOOD',
        parentId: parent.id,
        state: city.state,
        lat: n.lat,
        lng: n.lng,
        sortOrder: i,
      })
      .onConflictDoUpdate({ target: schema.zone.slug, set: { name: n.name, lat: n.lat, lng: n.lng, sortOrder: i, parentId: parent.id } });
  }
}

// Ejecución directa: `bun src/server/db/seed.ts`
if (import.meta.main) {
  Promise.all([seedCatalog(), seedZones()])
    .then(() => console.log('Catálogo y zonas sembrados'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
