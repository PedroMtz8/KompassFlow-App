// Tablas de Better Auth (usuarios, sesiones, cuentas, organizaciones...).
// Se regeneran con `npm run auth:generate` cuando cambian los plugins de auth.
export * from './auth';

// Tablas de tu dominio: crea un archivo por módulo y expórtalo aquí.
// export * from './posts';

// Catálogo de rubros (verticales), disciplinas e intereses del usuario.
export * from './catalog';

// Organizaciones (datos de dominio), ubicaciones, salones y bitácora de auditoría.
export * from './organizations';

// Ciudades y colonias (catálogo geográfico).
export * from './zones';

// Servicios (qué se vende), series recurrentes y sesiones (cuándo ocurre).
export * from './classes';

// Alumnos (clientes de una organización) y reservas de sesiones.
export * from './bookings';

// Productos, pagos, pases (créditos/membresías), cortes de caja y datos de cobro.
export * from './payments';

// Avisos dentro de la app, tokens de push, preferencias y marcas para no repetir avisos programados.
export * from './notifications';

// Lista de espera de las sesiones llenas.
export * from './waitlist';

// Ajustes de planes y comisiones que edita el administrador de la plataforma.
export * from './admin';
