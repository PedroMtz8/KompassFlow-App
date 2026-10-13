import { Elysia, t } from "elysia";

import { authPlugin } from "../auth/plugin";
import { authorize, getMemberRole } from "../db/organizations";
import {
  cashPreview,
  closeCash,
  createProduct,
  getPaymentSettings,
  listPayments,
  myPaymentHistory,
  listProducts,
  myMembership,
  myTransfer,
  notifyTransfer,
  paymentsSummary,
  publicProducts,
  registerPayment,
  requestTransfer,
  resolveTransfer,
  savePaymentSettings,
  addPassMember,
  removePassMember,
  updateProduct,
} from "../db/payments";
import { allow } from "../lib/rate-limit";
import { hasError } from "./result";

const text = (max: number) => t.String({ maxLength: max });
const money = t.Integer({ minimum: 0, maximum: 100_000_000 });
const TOO_MANY = "Demasiados intentos. Espera un momento e inténtalo de nuevo.";

const errors = {
  NOT_FOUND: [404, "No encontrado."],
  STUDENT_NOT_FOUND: [404, "Ese alumno no es de tu organización."],
  PRODUCT_NOT_FOUND: [422, "Ese producto no existe o está desactivado."],
  CONCEPT_REQUIRED: [422, "Indica el concepto del cobro."],
  AMOUNT_REQUIRED: [422, "Indica el monto."],
  DUPLICATE_REFERENCE: [409, "Esa referencia ya está registrada."],
  NOT_PENDING: [409, "Este pago ya fue resuelto."],
  CREDITS_REQUIRED: [422, "Un paquete necesita al menos 1 crédito."],
  VALIDITY_REQUIRED: [422, "Una mensualidad necesita días de vigencia."],
  INVALID_CLABE: [422, "La CLABE debe tener 18 dígitos."],
  BENEFICIARY_REQUIRED: [422, "Indica el nombre del beneficiario."],
  NOTHING_TO_CLOSE: [409, "No hay efectivo por cerrar."],
  TRANSFER_NOT_ACCEPTED: [
    409,
    "Esta academia no recibe transferencias por ahora.",
  ],
  SEATS_INVALID: [422, "Las personas del paquete deben ser entre 1 y 20."],
  MEMBER_NOT_FOUND: [
    422,
    "Alguna de las personas no es alumna de tu organización.",
  ],
  MEMBERS_NEED_PRODUCT: [
    422,
    "Solo un paquete o mensualidad se puede compartir.",
  ],
  TOO_MANY_PEOPLE: [422, "Hay más personas que lugares en este paquete."],
  FULL: [409, "El paquete ya no tiene lugares libres."],
  ALREADY_IN: [409, "Esa persona ya está en el paquete."],
  IS_HOLDER: [409, "Es quien pagó el paquete: no se puede sumar ni quitar."],
  EXPIRED: [409, "El paquete ya venció."],
  TRY_AGAIN: [503, "No pudimos generar tu referencia. Inténtalo de nuevo."],
} as const;

/** Autoriza `resource.action` en la organización: 404 si no es miembro, 403 si no tiene el permiso. */
async function guard(
  userId: string,
  orgId: string,
  resource: "payment" | "product" | "cash",
  action: string,
) {
  if (!(await getMemberRole(userId, orgId))) return 404 as const;
  if (!(await authorize(userId, orgId, resource, action))) return 403 as const;
  return null;
}
const denied = (code: 404 | 403) =>
  code === 404
    ? { message: "No encontrada" }
    : { message: "No tienes permiso." };

/** Productos, cobros manuales, transferencias, corte de caja y membresías. */
export const paymentsModule = new Elysia({ name: "payments" })
  .use(authPlugin)

  /* ── Lado organización ── */
  .get(
    "/orgs/:id/products",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "product", "read");
      if (d) return status(d, denied(d));
      return listProducts(params.id);
    },
    { auth: true },
  )
  .post(
    "/orgs/:id/products",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "product", "create");
      if (d) return status(d, denied(d));
      const r = await createProduct(user.id, params.id, body);
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 80 }),
        description: t.Optional(text(300)),
        kind: t.Union([
          t.Literal("SINGLE"),
          t.Literal("PACKAGE"),
          t.Literal("MEMBERSHIP"),
        ]),
        priceCents: money,
        credits: t.Optional(t.Integer({ minimum: 1, maximum: 1000 })),
        validityDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
        seats: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        isVisible: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/orgs/:id/products/:productId",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "product", "update");
      if (d) return status(d, denied(d));
      const r = await updateProduct(user.id, params.id, params.productId, body);
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        description: t.Optional(text(300)),
        priceCents: t.Optional(money),
        credits: t.Optional(t.Integer({ minimum: 1, maximum: 1000 })),
        validityDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
        seats: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        isVisible: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/orgs/:id/payment-settings",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "payment", "read");
      if (d) return status(d, denied(d));
      return getPaymentSettings(params.id);
    },
    { auth: true },
  )
  .put(
    "/orgs/:id/payment-settings",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "product", "update");
      if (d) return status(d, denied(d));
      const r = await savePaymentSettings(user.id, params.id, body);
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        acceptsCash: t.Boolean(),
        acceptsTransfer: t.Boolean(),
        bank: t.Optional(text(60)),
        clabe: t.Optional(text(30)),
        beneficiary: t.Optional(text(100)),
      }),
    },
  )
  .get(
    "/orgs/:id/payments/summary",
    async ({ user, params, query, status }) => {
      const d = await guard(user.id, params.id, "payment", "read");
      if (d) return status(d, denied(d));
      return paymentsSummary(params.id, query.month);
    },
    {
      auth: true,
      query: t.Object({
        month: t.Optional(t.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])$" })),
      }),
    },
  )
  .get(
    "/orgs/:id/payments",
    async ({ user, params, query, status }) => {
      const d = await guard(user.id, params.id, "payment", "read");
      if (d) return status(d, denied(d));
      return listPayments(params.id, {
        studentId: query.studentId,
        limit: query.limit,
        offset: query.offset,
        q: query.q,
        month: query.month,
      });
    },
    {
      auth: true,
      query: t.Object({
        studentId: t.Optional(text(64)),
        q: t.Optional(text(100)),
        month: t.Optional(t.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])$" })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/orgs/:id/payments",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "payment", "create");
      if (d) return status(d, denied(d));
      const r = await registerPayment(user.id, params.id, body);
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({
        studentId: t.String({ minLength: 1, maxLength: 64 }),
        productId: t.Optional(text(64)),
        concept: t.Optional(text(120)),
        amountCents: t.Optional(money),
        method: t.Union([
          t.Literal("CASH"),
          t.Literal("TRANSFER"),
          t.Literal("OTHER"),
        ]),
        reference: t.Optional(text(60)),
        note: t.Optional(text(300)),
        memberStudentIds: t.Optional(
          t.Array(t.String({ minLength: 1, maxLength: 64 }), { maxItems: 19 }),
        ),
      }),
    },
  )
  /** Suma o quita personas de un paquete compartido (no necesitan cuenta). */
  .post(
    "/orgs/:id/passes/:passId/members",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "payment", "update");
      if (d) return status(d, denied(d));
      const r = await addPassMember(
        user.id,
        params.id,
        params.passId,
        body.studentId,
      );
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({ studentId: t.String({ minLength: 1, maxLength: 64 }) }),
    },
  )
  .delete(
    "/orgs/:id/passes/:passId/members/:studentId",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "payment", "update");
      if (d) return status(d, denied(d));
      const r = await removePassMember(
        user.id,
        params.id,
        params.passId,
        params.studentId,
      );
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true },
  )
  .post(
    "/orgs/:id/payments/:paymentId/confirm",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "payment", "update");
      if (d) return status(d, denied(d));
      const r = await resolveTransfer(
        user.id,
        params.id,
        params.paymentId,
        "confirm",
      );
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true },
  )
  .post(
    "/orgs/:id/payments/:paymentId/reject",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "payment", "update");
      if (d) return status(d, denied(d));
      const r = await resolveTransfer(
        user.id,
        params.id,
        params.paymentId,
        "reject",
      );
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true },
  )
  .get(
    "/orgs/:id/cash",
    async ({ user, params, status }) => {
      const d = await guard(user.id, params.id, "cash", "read");
      if (d) return status(d, denied(d));
      return cashPreview(params.id);
    },
    { auth: true },
  )
  .post(
    "/orgs/:id/cash/close",
    async ({ user, params, body, status }) => {
      const d = await guard(user.id, params.id, "cash", "close");
      if (d) return status(d, denied(d));
      const r = await closeCash(
        user.id,
        params.id,
        body.countedCents,
        body.note,
      );
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    {
      auth: true,
      body: t.Object({ countedCents: money, note: t.Optional(text(300)) }),
    },
  )

  /* ── Lado persona ── */
  .get(
    "/discover/orgs/:id/products",
    async ({ params, status }) =>
      (await publicProducts(params.id)) ??
      status(404, { message: "No encontrada" }),
    { auth: true },
  )
  .post(
    "/discover/products/:id/transfer",
    async ({ user, params, status }) => {
      if (!(await allow(`transfer:${user.id}`, 10, 10 * 60_000)))
        return status(429, { message: TOO_MANY });
      const r = await requestTransfer(user, params.id);
      if (hasError(r))
        return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true },
  )
  .get("/me/membership", ({ user }) => myMembership(user.id), { auth: true })
  .get(
    "/me/payment-history",
    ({ user, query }) =>
      myPaymentHistory(user.id, {
        organizationId: query.organizationId,
        limit: query.limit,
        offset: query.offset,
      }),
    {
      auth: true,
      query: t.Object({
        organizationId: t.Optional(text(64)),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .get(
    "/me/payments/:id",
    async ({ user, params, status }) =>
      (await myTransfer(user.id, params.id)) ??
      status(404, { message: "No encontrado" }),
    { auth: true },
  )
  .post(
    "/me/payments/:id/notify",
    async ({ user, params, body, status }) => {
      if (!(await allow(`notify:${user.id}`, 20, 10 * 60_000)))
        return status(429, { message: TOO_MANY });
      const r = await notifyTransfer(user.id, params.id, body.trackingKey);
      if (hasError(r)) return status(404, { message: "No encontrado" });
      return r;
    },
    {
      auth: true,
      body: t.Object({ trackingKey: t.String({ maxLength: 60 }) }),
    },
  );
