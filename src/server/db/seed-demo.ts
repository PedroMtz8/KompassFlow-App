/**
 * Datos de demostración: academias de Tepic, Nayarit, con su dueño, información, espacios, clases y horarios,
 * para poder ver Descubrir con contenido real. No crea alumnos ni reservas.
 *
 *   bun run db:seed:demo            crea o actualiza (idempotente; regenera los horarios hacia adelante)
 *   bun run db:seed:demo -- --reset borra TODO lo demo (usuarios @demo.stagelight.test y sus organizaciones)
 *
 * Los negocios, nombres y teléfonos son FICTICIOS; las calles son reales de Tepic pero los números no.
 * Todas las cuentas demo comparten la contraseña `DEMO_PASSWORD` (solo para desarrollo).
 */
import { and, eq, inArray, like } from 'drizzle-orm';

import { auth } from '../auth';
import { localDate, addDays } from '../lib/time';
import { createService, scheduleSessions } from './classes';
import { seedCatalog, seedZones } from './seed';
import { db, schema } from './index';
import { createOrganization, getOrganizationDetail, updateOrganization } from './organizations';
import { createRoom } from './spaces';

export const DEMO_DOMAIN = 'demo.stagelight.test';
export const DEMO_PASSWORD = 'Stagelight-demo-1';
const TZ = 'America/Mazatlan';
const SPAN_DAYS = 55;

/* ── Datos ─────────────────────────────────────────────────────────────────── */

type Person = { key: string; name: string };
const people: Record<string, Person> = {
  laura: { key: 'laura', name: 'Laura Ruiz' },
  sofia: { key: 'sofia', name: 'Sofía Paz' },
  marco: { key: 'marco', name: 'Marco Díaz' },
  rocio: { key: 'rocio', name: 'Rocío Bernal' },
  elena: { key: 'elena', name: 'Elena Cortés' },
  nico: { key: 'nico', name: 'Nico Herrera' },
};
const email = (key: string) => `${key}@${DEMO_DOMAIN}`;

const photo = (id: string) => `https://images.unsplash.com/${id}?w=900&q=60&auto=format&fit=crop`;
const PHOTOS = {
  bachata: photo('photo-1568121980155-32fb5e8f101c'),
  ritmo: photo('photo-1504609813442-a8924e83f76e'),
  kizomba: photo('photo-1712192682756-ae5b3a8e7508'),
  tango: photo('photo-1545959570-a94084071b5d'),
  studio: photo('photo-1736660604938-a357b80f8775'),
};

type ServiceSeed = {
  name: string;
  discipline: string; // slug del catálogo de Baile
  kind?: 'GROUP' | 'PRIVATE' | 'WORKSHOP';
  level: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  priceMxn: number;
  durationMin: number;
  description: string;
  room: string;
  instructor: string;
  capacity?: number;
  /** Horarios: días de la semana (0 = domingo) y hora local. Varias entradas = varias series. */
  slots: { weekdays: number[]; time: string }[];
};

type AcademySeed = {
  owner: string;
  name: string;
  type: 'STUDIO' | 'PERSONAL';
  zone: string; // slug de la colonia
  address: string;
  description: string;
  phone: string;
  instagram: string;
  cover: string;
  rooms: { name: string; capacity: number; note?: string }[];
  instructors: string[];
  services: ServiceSeed[];
};

const academies: AcademySeed[] = [
  {
    owner: 'laura',
    name: 'Ritmo Latino Tepic',
    type: 'STUDIO',
    zone: 'tepic-centro',
    address: 'Av. México Norte 180',
    description: 'Bachata y salsa para todos los niveles, en el corazón de Tepic. Primera clase de prueba sin costo.',
    phone: '311 100 2001',
    instagram: '@ritmolatino.tepic',
    cover: PHOTOS.ritmo,
    rooms: [
      { name: 'Salón A', capacity: 20, note: 'Planta alta' },
      { name: 'Salón B', capacity: 14 },
    ],
    instructors: [],
    services: [
      {
        name: 'Bachata Principiantes',
        discipline: 'bachata',
        level: 'BEGINNER',
        priceMxn: 150,
        durationMin: 60,
        description: 'Base, ritmo y conducción. Ven sin pareja.',
        room: 'Salón A',
        instructor: 'laura',
        slots: [{ weekdays: [1, 3], time: '19:00' }],
      },
      {
        name: 'Salsa On1 Intermedio',
        discipline: 'salsa',
        level: 'INTERMEDIATE',
        priceMxn: 160,
        durationMin: 60,
        description: 'Giros, combinaciones y musicalidad.',
        room: 'Salón B',
        instructor: 'ceci',
        slots: [{ weekdays: [2, 4], time: '20:00' }],
      },
      {
        name: 'Bachata Sensual',
        discipline: 'bachata',
        level: 'ADVANCED',
        priceMxn: 180,
        durationMin: 75,
        description: 'Cuerpo, conexión y figuras avanzadas.',
        room: 'Salón A',
        instructor: 'laura',
        slots: [{ weekdays: [6], time: '11:00' }],
      },
    ],
  },
  {
    owner: 'sofia',
    name: 'Casa Tango Nayarit',
    type: 'STUDIO',
    zone: 'tepic-mololoa',
    address: 'Calle Hidalgo 45',
    description: 'Milonga semanal y clases de tango argentino. Ambiente cálido y sin prisas.',
    phone: '311 100 2002',
    instagram: '@casatango.nayarit',
    cover: PHOTOS.tango,
    rooms: [{ name: 'Salón Milonga', capacity: 24, note: 'Piso de duela' }],
    instructors: [],
    services: [
      {
        name: 'Tango Fundamentos',
        discipline: 'tango',
        level: 'BEGINNER',
        priceMxn: 170,
        durationMin: 90,
        description: 'Abrazo, caminata y primeras figuras.',
        room: 'Salón Milonga',
        instructor: 'sofia',
        slots: [{ weekdays: [1], time: '19:00' }],
      },
      {
        name: 'Tango Práctica',
        discipline: 'tango',
        level: 'ALL',
        priceMxn: 150,
        durationMin: 90,
        description: 'Práctica libre guiada, todos los niveles.',
        room: 'Salón Milonga',
        instructor: 'sofia',
        slots: [
          { weekdays: [4], time: '21:00' },
          { weekdays: [6], time: '20:00' },
        ],
      },
    ],
  },
  {
    owner: 'marco',
    name: 'Kizomba Lab',
    type: 'STUDIO',
    zone: 'tepic-lindavista',
    address: 'Av. Insurgentes 450',
    description: 'Laboratorio de kizomba y swing. Grupos pequeños, mucha técnica y mucha música.',
    phone: '311 100 2003',
    instagram: '@kizombalab.mx',
    cover: PHOTOS.kizomba,
    rooms: [{ name: 'Sala Luz', capacity: 16 }],
    instructors: [],
    services: [
      {
        name: 'Kizomba Fundamentos',
        discipline: 'kizomba',
        level: 'BEGINNER',
        priceMxn: 200,
        durationMin: 60,
        description: 'Conexión, postura y pasos base.',
        room: 'Sala Luz',
        instructor: 'marco',
        slots: [{ weekdays: [2, 4], time: '20:00' }],
      },
      {
        name: 'Swing Social',
        discipline: 'swing',
        level: 'ALL',
        priceMxn: 120,
        durationMin: 60,
        description: 'Lindy hop social. Aprende jugando.',
        room: 'Sala Luz',
        instructor: 'marco',
        slots: [{ weekdays: [5], time: '20:30' }],
      },
    ],
  },
  {
    owner: 'rocio',
    name: 'Estudio Cumbia y Más',
    type: 'STUDIO',
    zone: 'tepic-ciudad-del-valle',
    address: 'Av. Tecnológico 1020',
    description: 'Cumbia, hip hop y mucha energía. Ideal para empezar a moverte sin pena.',
    phone: '311 100 2004',
    instagram: '@cumbiaymas.tepic',
    cover: PHOTOS.bachata,
    rooms: [{ name: 'Salón Único', capacity: 30 }],
    instructors: [],
    services: [
      {
        name: 'Cumbia Fit',
        discipline: 'cumbia',
        level: 'ALL',
        priceMxn: 100,
        durationMin: 60,
        description: 'Cardio bailando cumbia. Cero experiencia.',
        room: 'Salón Único',
        instructor: 'ceci',
        slots: [{ weekdays: [1, 3, 5], time: '18:30' }],
      },
      {
        name: 'Hip Hop Urbano',
        discipline: 'hip-hop',
        level: 'BEGINNER',
        priceMxn: 130,
        durationMin: 60,
        description: 'Grooves, coreografía y freestyle.',
        room: 'Salón Único',
        instructor: 'diego',
        slots: [{ weekdays: [2, 4], time: '19:00' }],
      },
    ],
  },
  {
    owner: 'elena',
    name: 'Academia Ballet Aurora',
    type: 'STUDIO',
    zone: 'tepic-lomas-verdes',
    address: 'Calle Zacatecas 77',
    description: 'Ballet clásico y danza contemporánea para adultos y jóvenes.',
    phone: '311 100 2005',
    instagram: '@balletaurora.tepic',
    cover: PHOTOS.studio,
    rooms: [{ name: 'Salón de espejos', capacity: 12 }],
    instructors: [],
    services: [
      {
        name: 'Ballet Adultos',
        discipline: 'ballet',
        level: 'BEGINNER',
        priceMxn: 190,
        durationMin: 75,
        description: 'Barra, centro y técnica desde cero.',
        room: 'Salón de espejos',
        instructor: 'elena',
        slots: [{ weekdays: [1, 3], time: '18:00' }],
      },
      {
        name: 'Contemporáneo',
        discipline: 'contemporaneo',
        level: 'INTERMEDIATE',
        priceMxn: 190,
        durationMin: 75,
        description: 'Suelo, improvisación y composición.',
        room: 'Salón de espejos',
        instructor: 'valeria',
        slots: [{ weekdays: [5], time: '18:00' }],
      },
    ],
  },
  {
    owner: 'nico',
    name: 'Nico Privadas',
    type: 'PERSONAL',
    zone: 'tepic-fray-junipero-serra',
    address: 'Calle Morelos 310',
    description: 'Clases privadas de bachata y salsa, individuales o en pareja. Ideal para bodas y XV años.',
    phone: '311 100 2006',
    instagram: '@nico.privadas',
    cover: PHOTOS.ritmo,
    rooms: [{ name: 'Estudio', capacity: 2 }],
    instructors: [],
    services: [
      {
        name: 'Clase privada de bachata',
        discipline: 'bachata',
        kind: 'PRIVATE',
        level: 'ALL',
        priceMxn: 450,
        durationMin: 60,
        description: 'Una hora solo para ti (o tu pareja), con plan a tu medida.',
        room: 'Estudio',
        instructor: 'nico',
        capacity: 1,
        slots: [
          { weekdays: [2, 4], time: '10:00' },
          { weekdays: [2, 4], time: '16:00' },
          { weekdays: [6], time: '12:00' },
        ],
      },
    ],
  },
];

/* ── Utilidades ────────────────────────────────────────────────────────────── */

async function ensureUser(p: Person) {
  const mail = email(p.key);
  let u = await db.query.user.findFirst({ where: eq(schema.user.email, mail) });
  if (!u) {
    await auth.api.signUpEmail({ body: { name: p.name, email: mail, password: DEMO_PASSWORD } });
    u = await db.query.user.findFirst({ where: eq(schema.user.email, mail) });
  }
  // Cuentas demo con correo "verificado" (sin proveedor de correo aún) para poder aceptar invitaciones.
  await db.update(schema.user).set({ emailVerified: true, name: p.name }).where(eq(schema.user.id, u!.id));
  return u!.id;
}

async function reset() {
  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(like(schema.user.email, `%@${DEMO_DOMAIN}`));
  const ids = users.map((u) => u.id);
  if (!ids.length) return console.log('No hay datos demo.');
  const orgs = await db
    .select({ id: schema.member.organizationId })
    .from(schema.member)
    .where(and(inArray(schema.member.userId, ids), eq(schema.member.role, 'owner')));
  for (const o of orgs) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, o.id));
    await db.delete(schema.organization).where(eq(schema.organization.id, o.id));
  }
  for (const id of ids) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.actorUserId, id));
    await db.delete(schema.user).where(eq(schema.user.id, id));
  }
  console.log(`Borrado: ${orgs.length} organizaciones y ${ids.length} usuarios demo.`);
}

/* ── Siembra ───────────────────────────────────────────────────────────────── */

async function seedAcademy(a: AcademySeed, userIds: Record<string, string>, disc: Map<string, string>, zones: Map<string, string>) {
  const ownerId = userIds[a.owner];

  // ¿Ya existe esta organización de este dueño?
  const mine = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .innerJoin(
      schema.member,
      and(eq(schema.member.organizationId, schema.organization.id), eq(schema.member.userId, ownerId), eq(schema.member.role, 'owner'))
    )
    .where(eq(schema.organization.name, a.name));
  let orgId = mine[0]?.id;

  if (!orgId) {
    const r = await createOrganization(ownerId, {
      name: a.name,
      type: a.type,
      description: a.description,
      phone: a.phone,
      instagram: a.instagram,
      address: a.address,
      zoneId: zones.get(a.zone),
      roomName: a.rooms[0].name,
      roomCapacity: a.rooms[0].capacity,
    });
    if ('error' in r) throw new Error(`${a.name}: ${r.error}`);
    orgId = r.id;
  } else {
    await updateOrganization(ownerId, orgId, { description: a.description, phone: a.phone, instagram: a.instagram });
  }
  await db
    .update(schema.organizationDetail)
    .set({ coverImage: a.cover, isPublished: true, verificationStatus: 'APPROVED', verificationReviewedAt: new Date() }) // datos de demostración: ya «verificados»
    .where(eq(schema.organizationDetail.organizationId, orgId));

  // Espacios
  let detail = (await getOrganizationDetail(orgId))!;
  const loc = detail.locations[0];
  for (const r of a.rooms.slice(1)) {
    if (!loc.rooms.some((x) => x.name === r.name)) await createRoom(ownerId, orgId, loc.id, r);
  }
  const first = a.rooms[0];
  await db
    .update(schema.room)
    .set({ note: first.note ?? null })
    .where(and(eq(schema.room.organizationId, orgId), eq(schema.room.name, first.name)));
  detail = (await getOrganizationDetail(orgId))!;
  const roomId = new Map(detail.locations.flatMap((l) => l.rooms).map((r) => [r.name, r.id]));

  // Instructores del equipo
  for (const k of a.instructors) {
    await db
      .insert(schema.member)
      .values({ id: crypto.randomUUID(), organizationId: orgId, userId: userIds[k], role: 'instructor', createdAt: new Date() })
      .onConflictDoNothing();
  }

  // Servicios y horarios: se regeneran en cada corrida (el calendario siempre mira hacia adelante).
  await db.delete(schema.service).where(eq(schema.service.organizationId, orgId));
  await db.delete(schema.student).where(eq(schema.student.organizationId, orgId));
  const start = localDate(Date.now(), TZ);
  const end = addDays(start, SPAN_DAYS);

  let sessions = 0;
  for (const s of a.services) {
    const base = {
      roomId: roomId.get(s.room)!,
      instructorUserId: userIds[s.instructor],
      capacity: s.capacity,
      startDate: start,
      endDate: end,
    };
    const created = await createService(
      ownerId,
      orgId,
      {
        name: s.name,
        description: s.description,
        kind: s.kind ?? 'GROUP',
        disciplineId: disc.get(s.discipline),
        level: s.level,
        priceCents: s.priceMxn * 100,
        durationMin: s.durationMin,
      },
      { ...base, startTime: s.slots[0].time, weekdays: s.slots[0].weekdays }
    );
    if ('error' in created) throw new Error(`${a.name} / ${s.name}: ${JSON.stringify(created)}`);
    sessions += created.sessions;
    for (const slot of s.slots.slice(1)) {
      const more = await scheduleSessions(ownerId, orgId, created.id, { ...base, startTime: slot.time, weekdays: slot.weekdays });
      if ('error' in more) throw new Error(`${a.name} / ${s.name}: ${JSON.stringify(more)}`);
      sessions += more.sessions;
    }
  }

  console.log(`  ✓ ${a.name} — ${a.zone.replace('tepic-', '')} · ${sessions} sesiones`);
}

async function main() {
  if (process.argv.includes('--reset')) return reset();

  await seedCatalog();
  await seedZones();

  const baile = await db.query.vertical.findFirst({ where: eq(schema.vertical.slug, 'baile') });
  const discs = await db.select().from(schema.discipline).where(eq(schema.discipline.verticalId, baile!.id));
  const disc = new Map(discs.map((d) => [d.slug, d.id]));
  const zs = await db.select().from(schema.zone).where(eq(schema.zone.kind, 'NEIGHBORHOOD'));
  const zones = new Map(zs.map((z) => [z.slug, z.id]));

  console.log('Usuarios demo…');
  const userIds: Record<string, string> = {};
  for (const p of Object.values(people)) userIds[p.key] = await ensureUser(p);

  console.log('Academias…');
  for (const a of academies) await seedAcademy(a, userIds, disc, zones);

  console.log(`\nListo. Contraseña de todas las cuentas demo: ${DEMO_PASSWORD}`);
  for (const a of academies) console.log(`  ${people[a.owner].name.padEnd(14)} ${email(a.owner).padEnd(34)} → ${a.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
