import { and, asc, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db, schema } from './index';
import { parseTerms } from './terms';

/** Rubro que se asigna por defecto a todo usuario nuevo mientras sea el único activo. */
export const DEFAULT_VERTICAL_SLUG = 'baile';

/** Asigna el rubro por defecto (Baile) a un usuario recién creado. Idempotente. */
export async function assignDefaultVertical(userId: string) {
  const v = await db.query.vertical.findFirst({ where: eq(schema.vertical.slug, DEFAULT_VERTICAL_SLUG) });
  if (!v) return;
  await db.insert(schema.userVertical).values({ userId, verticalId: v.id }).onConflictDoNothing();
}

/** Catálogo completo para el onboarding: rubros (activos primero) con sus disciplinas. */
export async function getCatalog() {
  const verticals = await db.query.vertical.findMany({
    orderBy: [asc(schema.vertical.sortOrder)],
    with: { disciplines: { orderBy: [asc(schema.discipline.sortOrder)] } },
  });
  return verticals.map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    isActive: v.isActive,
    terms: parseTerms(v.terms),
    disciplines: v.disciplines.filter((d) => d.isActive).map((d) => ({ id: d.id, slug: d.slug, name: d.name })),
  }));
}

export async function getUserInterests(userId: string) {
  const [verticals, interests] = await Promise.all([
    db.select({ id: schema.userVertical.verticalId }).from(schema.userVertical).where(eq(schema.userVertical.userId, userId)),
    db.select({ id: schema.userInterest.disciplineId }).from(schema.userInterest).where(eq(schema.userInterest.userId, userId)),
  ]);
  return { verticalIds: verticals.map((v) => v.id), disciplineIds: interests.map((i) => i.id) };
}

/**
 * Reemplaza los intereses del usuario. Solo se aceptan rubros activos y disciplinas activas de
 * esos rubros; los rubros de las disciplinas elegidas se agregan solos. Si queda vacío, se
 * conserva el rubro por defecto (los intereses personalizan, nunca bloquean).
 */
export async function saveUserInterests(userId: string, input: { verticalIds: string[]; disciplineIds: string[] }) {
  const activeVerticals = await db
    .select({ id: schema.vertical.id, slug: schema.vertical.slug })
    .from(schema.vertical)
    .where(eq(schema.vertical.isActive, true));
  const activeIds = new Set(activeVerticals.map((v) => v.id));

  const disciplines = input.disciplineIds.length
    ? await db
        .select({ id: schema.discipline.id, verticalId: schema.discipline.verticalId })
        .from(schema.discipline)
        .where(and(inArray(schema.discipline.id, input.disciplineIds), eq(schema.discipline.isActive, true)))
    : [];
  const validDisciplines = disciplines.filter((d) => activeIds.has(d.verticalId));

  const verticalIds = new Set(input.verticalIds.filter((id) => activeIds.has(id)));
  for (const d of validDisciplines) verticalIds.add(d.verticalId);
  if (verticalIds.size === 0) {
    const fallback = activeVerticals.find((v) => v.slug === DEFAULT_VERTICAL_SLUG) ?? activeVerticals[0];
    if (fallback) verticalIds.add(fallback.id);
  }

  const statements: BatchItem<'sqlite'>[] = [
    db.delete(schema.userVertical).where(eq(schema.userVertical.userId, userId)),
    db.delete(schema.userInterest).where(eq(schema.userInterest.userId, userId)),
  ];
  if (verticalIds.size)
    statements.push(db.insert(schema.userVertical).values([...verticalIds].map((verticalId) => ({ userId, verticalId }))));
  if (validDisciplines.length)
    statements.push(db.insert(schema.userInterest).values(validDisciplines.map((d) => ({ userId, disciplineId: d.id }))));
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  return getUserInterests(userId);
}
