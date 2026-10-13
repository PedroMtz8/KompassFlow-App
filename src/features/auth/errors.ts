/** Mensajes en español para los errores de Better Auth (vienen en inglés desde el servidor). */
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Correo o contraseña incorrectos.',
  INVALID_EMAIL: 'El correo no es válido.',
  INVALID_PASSWORD: 'La contraseña no es correcta.',
  USER_NOT_FOUND: 'No encontramos una cuenta con ese correo.',
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con ese correo.',
  PASSWORD_TOO_SHORT: 'La contraseña es demasiado corta (mínimo 8 caracteres).',
  PASSWORD_TOO_LONG: 'La contraseña es demasiado larga.',
  EMAIL_NOT_VERIFIED: 'Confirma tu correo antes de entrar.',
  PROVIDER_NOT_FOUND: 'Este método de acceso no está disponible.',
  FAILED_TO_CREATE_USER: 'No pudimos crear la cuenta. Inténtalo de nuevo.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera un momento.',
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 429) return messages.TOO_MANY_REQUESTS;
  return fallback;
}
