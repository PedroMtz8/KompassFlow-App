import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import { env } from '../env';
import { db, schema } from './index';
import { notifyMany } from './notifications';
import { auditStatement } from './organizations';

/**
 * Verificación de organizaciones antes de salir en Descubrir.
 *
 * 1. Toda organización nace oculta (`isPublished = false`, `verificationStatus = NONE`).
 * 2. Para pedir la revisión debe cumplir los requisitos de `listingChecklist` (perfil completo, una sede con espacio, una clase y un
 *    producto con precio, y un medio de contacto para poder comprobar que existe).
 * 3. La solicitud queda PENDING y un administrador de la plataforma comprueba que el negocio es real (sitio web, redes, llamada).
 * 4. Al aprobarla pasa a APPROVED y se publica; desde entonces el dueño puede ocultarla o mostrarla cuando quiera. Si se rechaza
 *    (o se suspende una ya aprobada) se oculta y el dueño ve el motivo; puede corregir y volver a pedirla.
 */

export type ChecklistItem = { key: string; label: string; hint: string; ok: boolean };

export const VERIFICATION_METHODS = ['WEBSITE', 'SOCIAL', 'PHONE', 'OTHER'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/** Requisitos para pedir la publicación, con su estado actual. */
export async function listingChecklist(organizationId: string): Promise<ChecklistItem[]> {
  const [org, detail, [loc], [svc], [prod]] = await Promise.all([
    db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) }),
    db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId), with: { vertical: true } }),
    db
      .select({ n: count() })
      .from(schema.room)
      .innerJoin(schema.location, eq(schema.location.id, schema.room.locationId))
      .where(eq(schema.location.organizationId, organizationId)),
    db
      .select({ n: count() })
      .from(schema.service)
      .where(and(eq(schema.service.organizationId, organizationId), eq(schema.service.isActive, true))),
    db
      .select({ n: count() })
      .from(schema.product)
      .where(and(eq(schema.product.organizationId, organizationId), eq(schema.product.isActive, true), sql`${schema.product.priceCents} > 0`)),
  ]);
  let terms: { room?: string; class?: string } = {};
  try {
    terms = JSON.parse(detail?.vertical?.terms ?? '{}');
  } catch {}
  const room = (terms.room ?? 'espacio').toLowerCase();
  const filled = (s: string | null | undefined) => !!s?.trim();
  return [
    { key: 'logo', label: 'Foto de perfil', hint: 'El logo o una foto para que te reconozcan.', ok: filled(org?.logo) },
    { key: 'cover', label: 'Imagen de portada', hint: 'Es lo primero que ven en Descubrir.', ok: filled(detail?.coverImage) },
    {
      key: 'description',
      label: 'Descripción',
      hint: 'Cuenta en al menos 20 caracteres qué ofreces.',
      ok: (detail?.description?.trim().length ?? 0) >= 20,
    },
    {
      key: 'contact',
      label: 'Teléfono, sitio web o Instagram',
      hint: 'Con esto comprobamos que tu negocio existe. Agrega al menos uno.',
      ok: filled(detail?.phone) || filled(detail?.website) || filled(detail?.instagram),
    },
    { key: 'location', label: `Una sede con su ${room}`, hint: 'La dirección donde das tus clases.', ok: (loc?.n ?? 0) > 0 },
    { key: 'service', label: 'Al menos una clase', hint: 'Lo que los alumnos van a reservar.', ok: (svc?.n ?? 0) > 0 },
    { key: 'product', label: 'Al menos un producto con precio', hint: 'Una clase suelta, un paquete o una membresía.', ok: (prod?.n ?? 0) > 0 },
  ];
}

const clean = (s?: string | null) => (s?.trim() ? s.trim() : null);

/** Estado de verificación visible para la propia organización (el motivo del rechazo sí; la nota interna, no). */
export async function getVerification(organizationId: string) {
  const d = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  if (!d) return null;
  const checklist = await listingChecklist(organizationId);
  const complete = checklist.every((c) => c.ok);
  return {
    status: d.verificationStatus,
    isPublished: d.isPublished,
    message: d.verificationMessage,
    requestedAt: d.verificationRequestedAt,
    reviewedAt: d.verificationReviewedAt,
    reason: d.verificationStatus === 'REJECTED' ? d.verificationReason : null,
    checklist,
    complete,
    canRequest: complete && (d.verificationStatus === 'NONE' || d.verificationStatus === 'REJECTED'),
  };
}

/** Correos de la plataforma → usuarios, para avisarles de una solicitud nueva. */
async function platformAdminIds() {
  const emails = env.platformAdminEmails;
  if (!emails.length) return [];
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(inArray(sql`lower(${schema.user.email})`, emails), eq(schema.user.emailVerified, true)));
  return rows.map((r) => r.id);
}

/** Quienes dirigen la organización (propietario y administradores): reciben el resultado de la revisión. */
async function leadersOf(organizationId: string) {
  const rows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), inArray(schema.member.role, ['owner', 'admin'])));
  return rows.map((r) => r.userId);
}

export async function requestVerification(userId: string, organizationId: string, message?: string | null) {
  const v = await getVerification(organizationId);
  if (!v) return { error: 'NOT_FOUND' as const };
  if (v.status === 'PENDING') return { error: 'ALREADY_PENDING' as const };
  if (v.status === 'APPROVED') return { error: 'ALREADY_APPROVED' as const };
  if (!v.complete) return { error: 'INCOMPLETE' as const, missing: v.checklist.filter((c) => !c.ok).map((c) => c.label) };
  const now = new Date();
  await db.batch([
    db
      .update(schema.organizationDetail)
      .set({
        verificationStatus: 'PENDING',
        verificationMessage: clean(message)?.slice(0, 500) ?? null,
        verificationRequestedAt: now,
        verificationReviewedAt: null,
        verificationReviewedBy: null,
        verificationReason: null,
        verificationMethod: null,
        isPublished: false,
      })
      .where(eq(schema.organizationDetail.organizationId, organizationId)),
    auditStatement({ organizationId, actorUserId: userId, action: 'organization.verification_requested', entityType: 'organization', entityId: organizationId }),
  ]);
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  await notifyMany(await platformAdminIds(), {
    category: 'team',
    title: 'Nueva solicitud de verificación',
    body: `${org?.name ?? 'Una organización'} pidió publicarse en Descubrir.`,
    url: `/admin-verification?id=${organizationId}`,
  });
  return { ok: true as const };
}

/* ── Administración ───────────────────────────────────────────────────────── */

export type VerificationFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';

/** Solicitudes para el panel: por estado, las más antiguas primero entre las pendientes (se atienden en orden). */
export async function listVerifications(opts: { status: VerificationFilter; limit?: number; offset?: number }) {
  const rows = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      logo: schema.organization.logo,
      type: schema.organizationDetail.type,
      status: schema.organizationDetail.verificationStatus,
      requestedAt: schema.organizationDetail.verificationRequestedAt,
      reviewedAt: schema.organizationDetail.verificationReviewedAt,
      isPublished: schema.organizationDetail.isPublished,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
    })
    .from(schema.organizationDetail)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.organizationDetail.organizationId))
    .leftJoin(schema.member, and(eq(schema.member.organizationId, schema.organization.id), eq(schema.member.role, 'owner')))
    .leftJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.organizationDetail.verificationStatus, opts.status))
    .orderBy(
      opts.status === 'PENDING' ? asc(schema.organizationDetail.verificationRequestedAt) : desc(schema.organizationDetail.verificationReviewedAt),
      asc(schema.organization.id)
    )
    .limit(Math.min(opts.limit ?? 30, 100))
    .offset(opts.offset ?? 0);
  return rows;
}

export async function verificationCounts() {
  const rows = await db
    .select({ status: schema.organizationDetail.verificationStatus, n: count() })
    .from(schema.organizationDetail)
    .groupBy(schema.organizationDetail.verificationStatus);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<VerificationFilter, number>>;
  return { pending: by.PENDING ?? 0, approved: by.APPROVED ?? 0, rejected: by.REJECTED ?? 0, none: by.NONE ?? 0 };
}

/** Todo lo que el administrador necesita para comprobar que el negocio existe. */
export async function verificationDetail(organizationId: string) {
  const [org, d, locations, products, services, v] = await Promise.all([
    db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) }),
    db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId), with: { vertical: true } }),
    db.query.location.findMany({ where: eq(schema.location.organizationId, organizationId), with: { rooms: true } }),
    db
      .select({ name: schema.product.name, kind: schema.product.kind, priceCents: schema.product.priceCents })
      .from(schema.product)
      .where(and(eq(schema.product.organizationId, organizationId), eq(schema.product.isActive, true)))
      .limit(10),
    db
      .select({ name: schema.service.name })
      .from(schema.service)
      .where(and(eq(schema.service.organizationId, organizationId), eq(schema.service.isActive, true)))
      .limit(10),
    getVerification(organizationId),
  ]);
  if (!org || !d || !v) return null;
  const [owner] = await db
    .select({ name: schema.user.name, email: schema.user.email, emailVerified: schema.user.emailVerified, createdAt: schema.user.createdAt })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, 'owner')))
    .limit(1);
  const history = await db
    .select({ action: schema.auditLog.action, at: schema.auditLog.createdAt, metadata: schema.auditLog.metadata })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entityId, organizationId), sql`${schema.auditLog.action} like 'organization.verification_%'`))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(20);
  return {
    id: org.id,
    name: org.name,
    logo: org.logo,
    coverImage: d.coverImage,
    type: d.type,
    vertical: d.vertical.name,
    description: d.description,
    phone: d.phone,
    instagram: d.instagram,
    website: d.website,
    createdAt: org.createdAt,
    owner: owner ?? null,
    locations: locations.map((l) => ({
      address: l.address,
      neighborhood: l.neighborhood,
      city: l.city,
      mapsUrl: l.mapsUrl,
      rooms: l.rooms.map((r) => r.name),
    })),
    products,
    services: services.map((s) => s.name),
    status: v.status,
    isPublished: v.isPublished,
    message: v.message,
    requestedAt: v.requestedAt,
    reviewedAt: v.reviewedAt,
    method: d.verificationMethod,
    reason: d.verificationReason,
    note: d.verificationNote,
    checklist: v.checklist,
    history,
  };
}

export async function approveVerification(adminId: string, organizationId: string, input: { method: VerificationMethod; note?: string | null }) {
  const d = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  if (!d) return { error: 'NOT_FOUND' as const };
  if (d.verificationStatus !== 'PENDING') return { error: 'NOT_PENDING' as const };
  await db.batch([
    db
      .update(schema.organizationDetail)
      .set({
        verificationStatus: 'APPROVED',
        verificationReviewedAt: new Date(),
        verificationReviewedBy: adminId,
        verificationMethod: input.method,
        verificationNote: clean(input.note)?.slice(0, 500) ?? null,
        verificationReason: null,
        isPublished: true,
      })
      .where(eq(schema.organizationDetail.organizationId, organizationId)),
    auditStatement({
      organizationId,
      actorUserId: adminId,
      action: 'organization.verification_approved',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { method: input.method },
    }),
  ]);
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  await notifyMany(await leadersOf(organizationId), {
    category: 'team',
    title: '¡Ya estás en Descubrir!',
    body: `${org?.name ?? 'Tu negocio'} fue verificado y ya es visible para los alumnos.`,
    organizationId,
    url: '/today',
  });
  return { ok: true as const };
}

/** Rechaza una solicitud o suspende una organización ya aprobada: queda oculta y el dueño ve el motivo. */
export async function rejectVerification(adminId: string, organizationId: string, input: { reason: string; note?: string | null }) {
  const d = await db.query.organizationDetail.findFirst({ where: eq(schema.organizationDetail.organizationId, organizationId) });
  if (!d) return { error: 'NOT_FOUND' as const };
  if (d.verificationStatus !== 'PENDING' && d.verificationStatus !== 'APPROVED') return { error: 'NOT_REVIEWABLE' as const };
  const suspended = d.verificationStatus === 'APPROVED';
  await db.batch([
    db
      .update(schema.organizationDetail)
      .set({
        verificationStatus: 'REJECTED',
        verificationReviewedAt: new Date(),
        verificationReviewedBy: adminId,
        verificationReason: input.reason.trim().slice(0, 500),
        verificationNote: clean(input.note)?.slice(0, 500) ?? null,
        isPublished: false,
      })
      .where(eq(schema.organizationDetail.organizationId, organizationId)),
    auditStatement({
      organizationId,
      actorUserId: adminId,
      action: 'organization.verification_rejected',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { reason: input.reason.trim(), suspended },
    }),
  ]);
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId) });
  await notifyMany(await leadersOf(organizationId), {
    category: 'team',
    title: suspended ? 'Tu negocio se ocultó de Descubrir' : 'No pudimos verificar tu negocio',
    body: `${org?.name ?? 'Tu negocio'}: ${input.reason.trim()}`.slice(0, 300),
    organizationId,
    url: '/verification',
  });
  return { ok: true as const };
}
