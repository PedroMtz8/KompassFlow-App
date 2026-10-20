/**
 * Textos legales (BORRADOR). Están redactados con lo que la app hace hoy, pero deben revisarse con un abogado antes de publicar
 * la app: el responsable, el domicilio y el correo de contacto de abajo son los que hay que completar.
 */
export const LEGAL = {
  /** Quien es responsable de los datos personales (razón social o persona física). */
  controller: process.env.EXPO_PUBLIC_LEGAL_NAME ?? 'KompassFlow',
  /** Domicilio del responsable (obligatorio en el aviso de privacidad mexicano). */
  address: process.env.EXPO_PUBLIC_LEGAL_ADDRESS ?? '[domicilio del responsable]',
  /** Correo para ejercer derechos ARCO y dudas de privacidad. */
  contactEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'privacidad@tu-dominio.com',
  updated: '20 de octubre de 2026',
};

export type LegalSection = { title: string; body: string[] };

export const PRIVACY: LegalSection[] = [
  {
    title: 'Quién es responsable de tus datos',
    body: [
      `${LEGAL.controller}, con domicilio en ${LEGAL.address}, es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.`,
    ],
  },
  {
    title: 'Qué datos recabamos',
    body: [
      'Cuenta: nombre, correo electrónico, contraseña (guardada de forma cifrada) y, si entras con Google, tu nombre y foto de perfil.',
      'Uso de la app: tus reservas, asistencia, pagos registrados por la academia, intereses y las academias a las que perteneces.',
      'Opcionales: teléfono, nivel de baile y fotos que subas. Si lo permites, tu ubicación aproximada para mostrarte clases cercanas; no la guardamos.',
      'Dispositivo: si activas las notificaciones, un identificador del teléfono (token) para enviarte avisos de tus clases. Para que puedas consultar tus reservas y tu perfil sin conexión, la app guarda en tu teléfono una copia temporal (hasta 7 días) de esa información; se borra al cerrar sesión.',
    ],
  },
  {
    title: 'Para qué los usamos',
    body: [
      'Crear y proteger tu cuenta, permitirte reservar, pagar y llevar tu historial, y enviarte correos y notificaciones necesarios del servicio (confirmar tu correo, recuperar tu contraseña, invitaciones y avisos de clases canceladas o modificadas).',
      'No vendemos tus datos ni los usamos para publicidad de terceros.',
    ],
  },
  {
    title: 'Con quién los compartimos',
    body: [
      'Con las academias donde te inscribes o reservas: ven tu nombre y la información que ellas necesitan para atenderte. Su personal solo ve tu teléfono y correo si su rol lo permite.',
      'Con proveedores que hacen posible el servicio y solo para eso: base de datos (Turso), almacenamiento de archivos (Cloudflare), correo (Resend), acceso con Google, envío de notificaciones y actualizaciones de la app (Expo, Apple y Google) y, cuando se active, procesamiento de pagos (Stripe).',
      'Con autoridades, solo cuando una ley o una orden lo exija.',
    ],
  },
  {
    title: 'Tus derechos (ARCO)',
    body: [
      'Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su uso. Editas tus datos desde Perfil → Configuración y puedes eliminar tu cuenta cuando quieras desde Perfil → Configuración → Eliminar mi cuenta.',
      `Para cualquier otra solicitud escribe a ${LEGAL.contactEmail}. Respondemos en un máximo de 20 días hábiles.`,
    ],
  },
  {
    title: 'Qué pasa cuando eliminas tu cuenta',
    body: [
      'Borramos tu cuenta, tus sesiones y tu acceso. Las academias conservan los registros de pagos, asistencia y reservas que necesitan para su contabilidad, pero sin tu nombre, correo, teléfono ni notas.',
    ],
  },
  {
    title: 'Seguridad y cambios',
    body: [
      'Usamos conexiones cifradas, contraseñas protegidas y permisos por rol para limitar quién ve cada dato.',
      `Si cambiamos este aviso te lo diremos en la app. Última actualización: ${LEGAL.updated}.`,
    ],
  },
];

export const TERMS: LegalSection[] = [
  {
    title: 'Qué es KompassFlow',
    body: [
      'KompassFlow es una plataforma para que academias y estudios publiquen sus clases y administren reservas, asistencia y pagos, y para que las personas descubran y reserven clases. KompassFlow no imparte las clases ni es parte de la relación entre la academia y sus alumnos.',
    ],
  },
  {
    title: 'Tu cuenta',
    body: [
      'Debes dar datos verdaderos y cuidar tu contraseña. Eres responsable de lo que se haga con tu cuenta. Si una academia te creó la cuenta con una contraseña temporal, debes cambiarla en tu primer acceso.',
    ],
  },
  {
    title: 'Reservas, pagos y cancelaciones',
    body: [
      'Cada academia define sus precios, paquetes y plazo de cancelación. Los pagos se acuerdan y se cobran entre tú y la academia; KompassFlow solo facilita el registro y, cuando se active, el procesamiento del pago.',
      'Si la academia cancela una clase, tu reserva se cancela con ella y te avisamos.',
    ],
  },
  {
    title: 'Uso adecuado',
    body: [
      'No uses la app para fines ilegales, para suplantar a otras personas, para enviar contenido ofensivo ni para intentar acceder a datos que no te corresponden. Podemos suspender cuentas que incumplan esto.',
    ],
  },
  {
    title: 'Academias',
    body: [
      'Quien administra una academia es responsable de la información que publica, de los datos de sus alumnos que consulta (solo para operar su negocio) y de dar a su equipo únicamente los permisos que necesita.',
    ],
  },
  {
    title: 'Contenido que subes',
    body: ['Conservas los derechos de tus fotos y textos, y nos autorizas a mostrarlos dentro de la app para el fin con el que los subiste.'],
  },
  {
    title: 'Limitación de responsabilidad',
    body: [
      'La actividad física implica riesgos que asume cada persona y la academia, no KompassFlow. Hacemos lo posible por mantener el servicio disponible, pero no garantizamos que no tenga interrupciones.',
    ],
  },
  {
    title: 'Cambios y contacto',
    body: [`Podemos actualizar estos términos y te avisaremos en la app. Dudas: ${LEGAL.contactEmail}. Última actualización: ${LEGAL.updated}.`],
  },
];

export const SUPPORT: LegalSection[] = [
  {
    title: 'Escríbenos',
    body: [
      `Para dudas, problemas con tu cuenta o sugerencias escribe a ${LEGAL.contactEmail}. Te respondemos en un máximo de 2 días hábiles.`,
      'Si algo falla, cuéntanos qué hacías, qué pasó y en qué teléfono (iPhone o Android); una captura de pantalla ayuda mucho.',
    ],
  },
  {
    title: 'No puedo entrar a mi cuenta',
    body: [
      'En la pantalla de inicio de sesión toca «¿Olvidaste tu contraseña?» y te enviaremos un correo para crear una nueva. Si tu academia te creó la cuenta con una contraseña temporal, la app te pedirá cambiarla en tu primer acceso.',
    ],
  },
  {
    title: 'Reservas y pagos',
    body: [
      'Cada academia define sus precios, paquetes y plazo de cancelación; para cambios en una reserva o un pago, habla primero con tu academia. Si hay un cobro que no reconoces, escríbenos con la fecha y el monto.',
    ],
  },
  {
    title: 'Eliminar mi cuenta y mis datos',
    body: [
      'Desde la app: Perfil → Configuración → Eliminar mi cuenta. Si no puedes entrar, escríbenos desde el correo de tu cuenta y la eliminamos por ti. Más detalle en el aviso de privacidad.',
    ],
  },
];
