import { Elysia, t } from 'elysia';

import { checkLimit } from '../db/billing';
import { authPlugin } from '../auth/plugin';
import { confirmIdentity } from '../auth/reauth';
import { allow } from '../lib/rate-limit';
import { hasError } from './result';
import { authorize, getMemberRole } from '../db/organizations';
import {
  cancelInvitation,
  changeMemberRole,
  getOwnMemberId,
  getTeam,
  inviteMember,
  listMyInvitations,
  removalPreview,
  transferOwnership,
  removeMember,
  respondInvitation,
} from '../db/team';

// Mantener alineado con `assignableRoles` (src/server/db/team.ts).
// Rol del sistema o personalizado: se valida contra la organización en `checkAssignableRole`.
const role = t.String({ minLength: 1, maxLength: 60 });

const errors = {
  NOT_FOUND: [404, 'No encontrado.'],
  ALREADY_MEMBER: [409, 'Esa persona ya es parte del equipo.'],
  ONLY_OWNER_CAN_GRANT_ADMIN: [403, 'Solo el propietario puede asignar o cambiar administradores.'],
  INVALID_ROLE: [422, 'Ese rol no existe en tu organización.'],
  ROLE_EXCEEDS_YOURS: [403, 'No puedes asignar un rol con más permisos de los que tú tienes.'],
  CANNOT_CHANGE_OWNER: [403, 'El propietario no se puede modificar.'],
  CANNOT_CHANGE_SELF: [403, 'No puedes cambiar tu propio rol.'],
  CANNOT_REMOVE_OWNER: [403, 'El propietario no se puede quitar.'],
  SELF: [409, 'Ya eres la persona propietaria.'],
  ALREADY_OWNER: [409, 'Esa persona ya es propietaria.'],
  NOT_VERIFIED: [409, 'Esa persona aún no confirma su correo. Pídele que lo confirme antes de traspasarle la academia.'],
  INVALID_REASSIGN: [422, 'Esa persona no puede tomar las clases (debe ser del equipo y dar clases).'],
  EMAIL_NOT_VERIFIED: [403, 'Verifica tu correo para aceptar invitaciones.'],
} as const;

/** Equipo de una organización (miembros e invitaciones) e invitaciones del usuario autenticado. */
export const teamModule = new Elysia({ name: 'team' })
  .use(authPlugin)
  .get(
    '/orgs/:id/team',
    async ({ user, params, status }) => {
      // Cualquier miembro ve al equipo; quien no es miembro recibe 404.
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      const [canContact, canInvites, canManage] = await Promise.all([
        authorize(user.id, params.id, 'member', 'read_contact').then(Boolean),
        authorize(user.id, params.id, 'invitation', 'create').then(Boolean),
        authorize(user.id, params.id, 'member', 'update').then(Boolean),
      ]);
      return getTeam(params.id, { canContact, canInvites, canManage });
    },
    { auth: true }
  )
  .post(
    '/orgs/:id/invitations',
    async ({ user, params, body, status }) => {
      const actorRole = await getMemberRole(user.id, params.id);
      if (!actorRole) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'invitation', 'create')))
        return status(403, { message: 'No tienes permiso para invitar.' });
      const limit = await checkLimit(params.id, 'members');
      if (!limit.ok) return status(402, { message: limit.message });
      const r = await inviteMember(user.id, actorRole, params.id, body.email, body.role);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true, body: t.Object({ email: t.String({ format: 'email', maxLength: 160 }), role }) }
  )
  .delete(
    '/orgs/:id/invitations/:invitationId',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'invitation', 'cancel'))) return status(403, { message: 'No tienes permiso.' });
      const r = await cancelInvitation(user.id, params.id, params.invitationId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .patch(
    '/orgs/:id/members/:memberId',
    async ({ user, params, body, status }) => {
      const actorRole = await getMemberRole(user.id, params.id);
      if (!actorRole) return status(404, { message: 'No encontrada' });
      if (!(await authorize(user.id, params.id, 'member', 'update'))) return status(403, { message: 'No tienes permiso.' });
      const r = await changeMemberRole(user.id, actorRole, params.id, params.memberId, body.role);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true, body: t.Object({ role }) }
  )
  .delete(
    '/orgs/:id/members/:memberId',
    async ({ user, params, query, status }) => {
      const actorRole = await getMemberRole(user.id, params.id);
      if (!actorRole) return status(404, { message: 'No encontrada' });
      // Quitar a otra persona exige permiso; salir uno mismo (si no eres propietario) siempre se permite.
      const self = await getOwnMemberId(user.id, params.id);
      if (self !== params.memberId && !(await authorize(user.id, params.id, 'member', 'delete')))
        return status(403, { message: 'No tienes permiso.' });
      const r = await removeMember(user.id, actorRole, params.id, params.memberId, query.reassignTo);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true, query: t.Object({ reassignTo: t.Optional(t.String({ maxLength: 64 })) }) }
  )
  .post(
    '/orgs/:id/transfer-ownership',
    async ({ user, session, params, body, status }) => {
      const role = await getMemberRole(user.id, params.id);
      if (!role) return status(404, { message: 'No encontrada' });
      if (role !== 'owner') return status(403, { message: 'Solo la persona propietaria puede traspasar la academia.' });
      if (!await allow(`transfer-owner:${user.id}`, 8, 10 * 60_000)) return status(429, { message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' });
      const denied = await confirmIdentity(user.id, session, body.password);
      if (denied) return status(denied.status, denied.body);
      const r = await transferOwnership(user.id, params.id, body.memberId);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true, body: t.Object({ memberId: t.String({ maxLength: 64 }), password: t.Optional(t.String({ maxLength: 128 })) }) }
  )
  .get(
    '/orgs/:id/members/:memberId/removal-preview',
    async ({ user, params, status }) => {
      if (!(await getMemberRole(user.id, params.id))) return status(404, { message: 'No encontrada' });
      const self = await getOwnMemberId(user.id, params.id);
      if (self !== params.memberId && !(await authorize(user.id, params.id, 'member', 'delete'))) return status(403, { message: 'No tienes permiso.' });
      return (await removalPreview(params.id, params.memberId)) ?? status(404, { message: 'No encontrado.' });
    },
    { auth: true }
  )
  .get('/me/invitations', ({ user }) => listMyInvitations(user.email), { auth: true })
  .post(
    '/me/invitations/:id/accept',
    async ({ user, params, status }) => {
      const r = await respondInvitation(user, params.id, true);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  )
  .post(
    '/me/invitations/:id/reject',
    async ({ user, params, status }) => {
      const r = await respondInvitation(user, params.id, false);
      if (hasError(r)) return status(errors[r.error][0], { message: errors[r.error][1] });
      return r;
    },
    { auth: true }
  );
