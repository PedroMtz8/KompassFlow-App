import { useMutation } from '@tanstack/react-query';

import { appLink } from '@/lib/app-link';
import { authClient } from '@/lib/auth-client';

import { authErrorMessage } from './errors';

/** Vuelve a mandar el correo para confirmar el correo de la cuenta. */
export function useResendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: appLink('/') });
      if (error) throw new Error(authErrorMessage(error, 'No pudimos enviar el correo. Inténtalo de nuevo.'));
    },
  });
}
