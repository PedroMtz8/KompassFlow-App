import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { sendPush } from '../lib/push';
import { reportError } from '../lib/report';
import { db, schema } from './index';

type Category = (typeof schema.notification.$inferInsert)['category'];

export type NotifyInput = { category: Category; title: string; body: string; url?: string; organizationId?: string };

const PREF_FIELD = { reminder: 'reminders', class: 'classChanges', payment: 'payments', team: 'team' } as const;

/** ¿Quiere esta persona este tipo de aviso? (todos activos por omisión). */
async function wants(userId: string, category: Category) {
  const p = await db.query.notificationPref.findFirst({ where: eq(schema.notificationPref.userId, userId) });
  return p ? p[PREF_FIELD[category]] : true;
}

/**
 * Avisa a una persona: guarda el aviso (la campana) y, si tiene dispositivos registrados, manda push. Respeta sus
 * preferencias: si apagó esa categoría no se guarda ni se envía nada. Mejor esfuerzo: NUNCA lanza (un aviso que falla no
 * debe tumbar la reserva o el pago que lo originó).
 */
export async function notify(userId: string, n: NotifyInput) {
  try {
    if (!(await wants(userId, n.category))) return null;
    const id = crypto.randomUUID();
    await db.insert(schema.notification).values({
      id,
      userId,
      organizationId: n.organizationId ?? null,
      category: n.category,
      title: n.title.slice(0, 120),
      body: n.body.slice(0, 400),
      url: n.url ?? null,
    });
    const tokens = await db.select({ token: schema.pushToken.token }).from(schema.pushToken).where(eq(schema.pushToken.userId, userId));
    if (tokens.length) {
      const { dead } = await sendPush(tokens.map((t) => ({ to: t.token, title: n.title, body: n.body, data: { url: n.url, id } })));
      if (dead.length) await db.delete(schema.pushToken).where(inArray(schema.pushToken.token, dead));
    }
    return id;
  } catch (e) {
    reportError(e, { source: 'notify', level: 'warning' });
    return null;
  }
}

/** Avisa a varias personas (sin repetir). */
export async function notifyMany(userIds: (string | null | undefined)[], n: NotifyInput) {
  const unique = [...new Set(userIds.filter((u): u is string => !!u))];
  await Promise.allSettled(unique.map((u) => notify(u, n)));
}

/** Personas de la academia con un permiso (para avisar al equipo, p. ej. «una transferencia por confirmar»). */
export async function membersWith(organizationId: string, resource: string, action: string) {
  // Import diferido: `access` importa la base y evita un ciclo al cargar este módulo desde auth.
  const { rolesWith } = await import('../auth/access');
  const roles = await rolesWith(organizationId, resource, action);
  if (!roles.length) return [];
  const rows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), inArray(schema.member.role, roles)));
  return rows.map((r) => r.userId);
}

/** Datos legibles de una sesión para armar avisos: clase, academia y «martes 14 de octubre, 19:00» en la zona de la academia. */
export async function describeSession(sessionId: string) {
  const [r] = await db
    .select({
      organizationId: schema.classSession.organizationId,
      startsAt: schema.classSession.startsAt,
      service: schema.service.name,
      org: schema.organization.name,
      tz: schema.organizationDetail.timezone,
    })
    .from(schema.classSession)
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.classSession.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .where(eq(schema.classSession.id, sessionId));
  if (!r) return null;
  const tz = r.tz ?? 'America/Mexico_City';
  const day = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(r.startsAt);
  return { organizationId: r.organizationId, service: r.service, org: r.org, when: `${day}, ${when(r.startsAt, tz)}` };
}

/** Dinero legible para un aviso («$800.00»). */
export const money = (cents: number, currency = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(cents / 100);

/** Avisa a la persona dueña de un registro de alumno (si tiene cuenta y no es quien hizo la acción). */
export async function notifyStudent(studentId: string, actorId: string | null, n: NotifyInput) {
  const st = await db.query.student.findFirst({ where: eq(schema.student.id, studentId), columns: { userId: true } });
  if (st?.userId && st.userId !== actorId) await notify(st.userId, n);
}

/* ── Bandeja ──────────────────────────────────────────────────────────────── */

export async function listNotifications(userId: string, page: { limit: number; offset: number }) {
  const rows = await db
    .select({
      id: schema.notification.id,
      category: schema.notification.category,
      title: schema.notification.title,
      body: schema.notification.body,
      url: schema.notification.url,
      readAt: schema.notification.readAt,
      createdAt: schema.notification.createdAt,
    })
    .from(schema.notification)
    .where(eq(schema.notification.userId, userId))
    .orderBy(desc(schema.notification.createdAt), desc(schema.notification.id))
    .limit(page.limit)
    .offset(page.offset);
  return rows;
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt)));
  return Number(r?.n ?? 0);
}

/** Marca como leídos los avisos indicados (solo los propios) o todos. */
export async function markRead(userId: string, ids?: string[]) {
  await db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt), ids?.length ? inArray(schema.notification.id, ids) : undefined));
}

/* ── Preferencias y dispositivos ──────────────────────────────────────────── */

export type Prefs = { reminders: boolean; classChanges: boolean; payments: boolean; team: boolean };

export async function getPrefs(userId: string): Promise<Prefs & { devices: number }> {
  const [p, devices] = await Promise.all([
    db.query.notificationPref.findFirst({ where: eq(schema.notificationPref.userId, userId) }),
    db.select({ n: sql<number>`count(*)` }).from(schema.pushToken).where(eq(schema.pushToken.userId, userId)),
  ]);
  return {
    reminders: p?.reminders ?? true,
    classChanges: p?.classChanges ?? true,
    payments: p?.payments ?? true,
    team: p?.team ?? true,
    devices: Number(devices[0]?.n ?? 0),
  };
}

export async function savePrefs(userId: string, prefs: Prefs) {
  await db.insert(schema.notificationPref).values({ userId, ...prefs }).onConflictDoUpdate({ target: schema.notificationPref.userId, set: prefs });
}

/** Registra el dispositivo. Si el token ya era de otra cuenta (se cambió de usuario en el mismo teléfono), pasa a esta. */
export async function registerPushToken(userId: string, token: string, platform: 'ios' | 'android' | 'web') {
  await db
    .insert(schema.pushToken)
    .values({ userId, token, platform })
    .onConflictDoUpdate({ target: schema.pushToken.token, set: { userId, platform } });
}

export async function removePushToken(userId: string, token: string) {
  await db.delete(schema.pushToken).where(and(eq(schema.pushToken.userId, userId), eq(schema.pushToken.token, token)));
}

/* ── Trabajos programados ─────────────────────────────────────────────────── */

const HOUR = 3600_000;

/** Reserva la marca; devuelve `false` si otra ejecución (o una anterior) ya la tenía. Es lo que evita avisos repetidos. */
async function claim(key: string) {
  const r = await db.insert(schema.notificationDedupe).values({ key }).onConflictDoNothing().returning({ key: schema.notificationDedupe.key });
  return r.length > 0;
}

function when(d: Date, tz: string) {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
}

/**
 * Recordatorios (se llama cada ~10 minutos):
 *  - clase en la próxima hora: un aviso por reserva confirmada (si la reservó con más de una hora de anticipación);
 *  - paquete que vence en 3 días o menos, o con un solo crédito: un aviso por paquete.
 * Cada aviso se reserva con una marca antes de enviarse, así dos ejecuciones simultáneas no lo duplican.
 */
export async function runReminders(now = Date.now()) {
  let classes = 0;
  let passes = 0;

  const due = await db
    .select({
      bookingId: schema.booking.id,
      userId: schema.student.userId,
      organizationId: schema.booking.organizationId,
      startsAt: schema.classSession.startsAt,
      service: schema.service.name,
      org: schema.organization.name,
      tz: schema.organizationDetail.timezone,
      room: schema.room.name,
    })
    .from(schema.booking)
    .innerJoin(schema.student, eq(schema.student.id, schema.booking.studentId))
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.sessionId))
    .innerJoin(schema.service, eq(schema.service.id, schema.classSession.serviceId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
    .innerJoin(schema.organizationDetail, eq(schema.organizationDetail.organizationId, schema.organization.id))
    .leftJoin(schema.room, eq(schema.room.id, schema.classSession.roomId))
    .where(
      and(
        eq(schema.booking.status, 'CONFIRMED'),
        eq(schema.classSession.status, 'SCHEDULED'),
        gt(schema.classSession.startsAt, new Date(now)),
        lt(schema.classSession.startsAt, new Date(now + HOUR)),
        // Quien reservó con menos de una hora de anticipación ya sabe que la clase es pronto.
        lt(schema.booking.createdAt, sql`${schema.classSession.startsAt} - ${HOUR}`)
      )
    )
    .limit(1000);
  for (const r of due) {
    if (!r.userId) continue;
    if (!(await claim(`reminder:${r.bookingId}`))) continue;
    const id = await notify(r.userId, {
      category: 'reminder',
      organizationId: r.organizationId,
      title: `Tu clase es hoy a las ${when(r.startsAt, r.tz ?? 'America/Mexico_City')}`,
      body: `${r.service} · ${r.org}${r.room ? ` · ${r.room}` : ''}`,
      url: `/booking?bookingId=${r.bookingId}`,
    });
    if (id) classes++;
  }

  const expiring = await db
    .select({ id: schema.studentPass.id, name: schema.studentPass.name, expiresAt: schema.studentPass.expiresAt, userId: schema.student.userId, organizationId: schema.studentPass.organizationId, org: schema.organization.name })
    .from(schema.studentPass)
    .innerJoin(schema.student, eq(schema.student.id, schema.studentPass.studentId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.studentPass.organizationId))
    .where(and(gte(schema.studentPass.expiresAt, new Date(now)), lt(schema.studentPass.expiresAt, new Date(now + 3 * 24 * HOUR))))
    .limit(1000);
  for (const p of expiring) {
    if (!p.userId || !(await claim(`passexp:${p.id}`))) continue;
    const days = Math.max(1, Math.ceil((p.expiresAt!.getTime() - now) / (24 * HOUR)));
    const id = await notify(p.userId, {
      category: 'payment',
      organizationId: p.organizationId,
      title: 'Tu paquete está por vencer',
      body: `${p.name} de ${p.org} vence en ${days} ${days === 1 ? 'día' : 'días'}. Úsalo o renuévalo.`,
      url: '/membership',
    });
    if (id) passes++;
  }

  // Limpieza: las marcas de más de 30 días ya no sirven.
  await db.delete(schema.notificationDedupe).where(lt(schema.notificationDedupe.at, new Date(now - 30 * 24 * HOUR)));
  return { classes, passes };
}
