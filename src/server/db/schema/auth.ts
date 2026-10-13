// Los índices marcados con [extra] NO los genera `auth:generate`: si regeneras este archivo,
// vuelve a añadirlos (están pensados para las rutas calientes de sesión, login social y membresías).
import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  stripeCustomerId: text('stripe_customer_id'),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  /** Cuenta creada por una academia con contraseña temporal: debe cambiarla antes de usar la app. */
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).default(false).notNull(),
  /** Hasta cuándo sirve la contraseña temporal (después hay que pedir otra a la academia). */
  tempPasswordExpiresAt: integer('temp_password_expires_at', { mode: 'timestamp_ms' }),
  /** Academia que creó la cuenta: solo ella puede regenerar las credenciales mientras no se activen. */
  managedByOrgId: text('managed_by_org_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('active_organization_id'),
  },
  (table) => [
    index('session_userId_idx').on(table.userId),
    // [extra] limpieza de sesiones vencidas
    index('session_expiresAt_idx').on(table.expiresAt),
  ]
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    // [extra] login social: se busca la cuenta por proveedor + id externo; evita duplicar la vinculación
    uniqueIndex('account_provider_account_uidx').on(table.providerId, table.accountId),
  ]
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('verification_identifier_idx').on(table.identifier),
    // [extra] limpieza de verificaciones vencidas
    index('verification_expiresAt_idx').on(table.expiresAt),
  ]
);

export const organization = sqliteTable('organization', {
  stripeCustomerId: text('stripe_customer_id'),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  metadata: text('metadata'),
});

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('member_organizationId_idx').on(table.organizationId),
    index('member_userId_idx').on(table.userId),
    // [extra] una persona no puede ser miembro dos veces de la misma organización; también
    // cubre la comprobación de rol (organización + usuario) que corre en cada petición autorizada.
    uniqueIndex('member_org_user_uidx').on(table.organizationId, table.userId),
  ]
);

export const invitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('invitation_organizationId_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
    // [extra] invitaciones pendientes por organización / por correo, y por quién invitó
    index('invitation_org_status_idx').on(table.organizationId, table.status),
    index('invitation_email_status_idx').on(table.email, table.status),
    index('invitation_inviterId_idx').on(table.inviterId),
  ]
);

/**
 * Roles personalizados de una organización (plugin `organization` con `dynamicAccessControl`). `role` es el nombre
 * (lo que se guarda en `member.role`) y `permission` un JSON `{ recurso: [acciones] }`. Los roles del sistema
 * (propietario, administrador, instructor, recepción) viven en código y no están aquí.
 */
export const organizationRole = sqliteTable(
  'organization_role',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$onUpdate(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    index('organizationRole_organizationId_idx').on(table.organizationId),
    index('organizationRole_role_idx').on(table.role),
    // [extra] un nombre de rol no se repite dentro de la misma organización
    uniqueIndex('organization_role_org_role_uidx').on(table.organizationId, table.role),
  ]
);

/**
 * Permisos adicionales de UNA persona sobre su rol (p. ej. un instructor que además puede ver reportes). `permission` es
 * un JSON `{ recurso: [acciones] }` con SOLO lo extra: los permisos reales son los del rol (que sigue vigente) más estos.
 * Si se cambia el rol de la persona, se borran.
 */
export const memberExtraPermission = sqliteTable(
  'member_extra_permission',
  {
    memberId: text('member_id')
      .primaryKey()
      .references(() => member.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index('member_extra_permission_org_idx').on(table.organizationId)]
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

/** Suscripción SaaS de una organización (`referenceId` = id de la organización). La administra el plugin de Stripe. */
export const subscription = sqliteTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    plan: text('plan').notNull(),
    referenceId: text('reference_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').default('incomplete').notNull(),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }),
    periodEnd: integer('period_end', { mode: 'timestamp_ms' }),
    trialStart: integer('trial_start', { mode: 'timestamp_ms' }),
    trialEnd: integer('trial_end', { mode: 'timestamp_ms' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
    cancelAt: integer('cancel_at', { mode: 'timestamp_ms' }),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    seats: integer('seats'),
    billingInterval: text('billing_interval'),
    stripeScheduleId: text('stripe_schedule_id'),
  },
  (table) => [
    // [extra] plan vigente de una organización (se consulta en cada petición con límites) y webhooks de Stripe
    index('subscription_reference_status_idx').on(table.referenceId, table.status),
    index('subscription_stripeSubscriptionId_idx').on(table.stripeSubscriptionId),
    index('subscription_stripeCustomerId_idx').on(table.stripeCustomerId),
  ]
);

/** Contadores del limitador de Better Auth cuando guarda en la base de datos (producción). */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key'),
  count: integer('count'),
  lastRequest: integer('last_request'),
});
