type WithPermissions = { permissions?: Record<string, string[]> } | null | undefined;

/**
 * ¿La persona puede hacer `action` sobre `resource` en esta organización? Los permisos efectivos (roles del sistema y
 * personalizados) los calcula el servidor y llegan con la organización: aquí solo se leen para mostrar u ocultar acciones.
 * La autorización real siempre se evalúa en el servidor.
 */
export function can(org: WithPermissions, resource: string, action: string) {
  return !!org?.permissions?.[resource]?.includes(action);
}
