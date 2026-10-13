import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';

/**
 * Permisos por rol de organización (PRD §2: OWNER, ADMIN, INSTRUCTOR, STAFF).
 * Los recursos son neutrales al rubro: "service/session" sirven igual para una clase de bachata,
 * de box o un entrenamiento de fútbol. Se evalúan SIEMPRE en el servidor.
 */
export const statements = {
  ...defaultStatements,
  // read_contact = ver los correos del equipo (datos personales: solo propietario, administrador y quien se le dé).
  member: ['create', 'update', 'delete', 'read_contact'],
  location: ['create', 'read', 'update', 'delete'], // ubicaciones y salones/áreas
  service: ['create', 'read', 'update', 'delete'], // lo que se vende (clase, privada, taller…)
  session: ['create', 'read', 'update', 'delete', 'teach'], // cuándo ocurre (sesión concreta); teach = puede impartir clases
  booking: ['create', 'read', 'update', 'cancel'],
  // read_contact = ver el teléfono y el correo de los alumnos (datos personales: quien solo pasa lista no los necesita).
  student: ['create', 'read', 'update', 'delete', 'read_contact'], // clientes de la organización
  payment: ['create', 'read', 'update', 'refund'],
  product: ['create', 'read', 'update'], // lo que se cobra: clase suelta, paquetes, mensualidades
  cash: ['read', 'close'], // corte de caja (efectivo)
  // update = pasar lista de las clases que imparte; update_any = también de las de otras personas
  attendance: ['create', 'read', 'update', 'update_any'],
  report: ['read'],
  plan: ['read', 'manage'], // suscripción de la organización a la plataforma
} as const;

export const ac = createAccessControl(statements);

const all = {
  member: ['create', 'update', 'delete', 'read_contact'],
  location: ['create', 'read', 'update', 'delete'],
  service: ['create', 'read', 'update', 'delete'],
  session: ['create', 'read', 'update', 'delete', 'teach'],
  booking: ['create', 'read', 'update', 'cancel'],
  student: ['create', 'read', 'update', 'delete', 'read_contact'],
  payment: ['create', 'read', 'update', 'refund'],
  product: ['create', 'read', 'update'],
  cash: ['read', 'close'],
  attendance: ['create', 'read', 'update', 'update_any'],
  report: ['read'],
  plan: ['read', 'manage'],
} as const;

export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, ...all }),
  admin: ac.newRole({ ...adminAc.statements, ...all, plan: ['read'] }),
  instructor: ac.newRole({
    location: ['read'],
    service: ['read'],
    session: ['read', 'teach'],
    booking: ['read'],
    student: ['read'],
    // Pasa lista solo en las clases que imparte (no tiene update_any).
    attendance: ['create', 'read', 'update'],
  }),
  staff: ac.newRole({
    location: ['read'],
    service: ['read'],
    session: ['read'],
    booking: ['create', 'read', 'update', 'cancel'],
    student: ['create', 'read', 'update', 'read_contact'],
    payment: ['create', 'read', 'update'],
    product: ['read'],
    cash: ['read', 'close'],
    attendance: ['create', 'read', 'update', 'update_any'],
  }),
};

export type OrgRole = keyof typeof roles;
export type Resource = keyof typeof statements;

/** ¿Este rol puede hacer `action` sobre `resource`? (rol desconocido => no). */
export function can(role: string | null | undefined, resource: Resource, action: string): boolean {
  const r = roles[role as OrgRole];
  if (!r) return false;
  const granted = (r.statements as Record<string, readonly string[] | undefined>)[resource];
  return !!granted?.includes(action);
}
