import { statements } from './permissions';

/** Textos para mostrar los permisos (la interfaz los toma de aquí, no los repite). */
export const RESOURCE_LABELS: Record<string, string> = {
  organization: 'Datos de la academia',
  member: 'Equipo',
  invitation: 'Invitaciones',
  ac: 'Roles y permisos',
  location: 'Sedes y salones',
  service: 'Clases y servicios',
  session: 'Agenda (sesiones)',
  booking: 'Reservas',
  student: 'Alumnos',
  payment: 'Pagos',
  product: 'Productos y precios',
  cash: 'Caja',
  attendance: 'Asistencia',
  report: 'Reportes',
  plan: 'Plan y facturación',
};

export const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  read: 'Ver',
  update: 'Editar',
  delete: 'Eliminar',
  cancel: 'Cancelar',
  refund: 'Reembolsar',
  close: 'Cerrar',
  manage: 'Administrar',
  teach: 'Impartir clases',
  update_any: 'Pasar lista en clases de otras personas',
  read_contact: 'Ver datos de contacto',
};

/** Texto de una acción cuando cambia según el recurso (p. ej. «ver contacto» es distinto en equipo y en alumnos). */
const ACTION_BY_RESOURCE: Record<string, Record<string, string>> = {
  member: { read_contact: 'Ver correos del equipo' },
  student: { read_contact: 'Ver teléfono y correo de alumnos' },
};

/** Acciones que NO se ofrecen en roles personalizados aunque existan (solo las tiene quien es propietario). */
const NOT_GRANTABLE: Record<string, string[]> = { organization: ['delete'] };
/** Recursos que el producto no usa (vienen del plugin de organizaciones). */
const HIDDEN = new Set(['team']);

/** Catálogo de recursos y acciones que se pueden asignar a un rol. */
export function permissionCatalog() {
  return Object.entries(statements as Record<string, readonly string[]>)
    .filter(([resource]) => !HIDDEN.has(resource))
    .map(([resource, actions]) => ({
      resource,
      label: RESOURCE_LABELS[resource] ?? resource,
      actions: actions
        .filter((a) => !NOT_GRANTABLE[resource]?.includes(a))
        .map((a) => ({ id: a, label: ACTION_BY_RESOURCE[resource]?.[a] ?? ACTION_LABELS[a] ?? a })),
    }))
    .filter((r) => r.actions.length > 0);
}

export const SYSTEM_ROLE_INFO: Record<string, { label: string; description: string }> = {
  owner: { label: 'Propietario', description: 'Control total de la academia.' },
  admin: { label: 'Administrador', description: 'Gestiona todo, salvo eliminar la academia y el plan.' },
  instructor: { label: 'Instructor', description: 'Imparte clases y pasa lista solo en las suyas.' },
  staff: { label: 'Staff', description: 'Reservas, alumnos, pagos y caja.' },
};
