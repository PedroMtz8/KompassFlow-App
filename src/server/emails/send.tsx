import { env } from '../env';
import { sendEmail } from '../lib/email';

/**
 * Un envío por tipo de correo: es lo que usa el resto del servidor (sin tocar JSX). Las plantillas se importan al enviar
 * (no al arrancar) para que el servidor en la nube arranque rápido.
 */

export const sendResetPassword = (user: { email: string; name: string }, url: string) =>
  sendEmail({
    to: user.email,
    subject: 'Restablece tu contraseña de KompassFlow',
    react: async () => {
      const { ResetPasswordEmail } = await import('./reset-password');
      return <ResetPasswordEmail name={user.name} url={url} />;
    },
  });

export const sendVerifyEmail = (user: { email: string; name: string }, url: string) =>
  sendEmail({
    to: user.email,
    subject: 'Confirma tu correo de KompassFlow',
    react: async () => {
      const { VerifyEmailEmail } = await import('./verify-email');
      return <VerifyEmailEmail name={user.name} url={url} />;
    },
  });

export const sendInvitation = (to: string, data: { inviter: string; organization: string; role: string }) =>
  sendEmail({
    to,
    subject: `${data.inviter} te invitó a ${data.organization}`,
    react: async () => {
      const { InvitationEmail } = await import('./invitation');
      return <InvitationEmail {...data} url={`${env.appUrl}/sign-in`} />;
    },
  });

export const sendClassCanceled = (to: string, data: { name: string; organization: string; service: string; when: string }) =>
  sendEmail({
    to,
    subject: `Se canceló ${data.service} de ${data.organization}`,
    react: async () => {
      const { ClassCanceledEmail } = await import('./class-canceled');
      return <ClassCanceledEmail {...data} url={`${env.appUrl}/discover`} />;
    },
  });

export const sendAccountDeleted = (to: string, name: string) =>
  sendEmail({
    to,
    subject: 'Eliminamos tu cuenta de KompassFlow',
    react: async () => {
      const { AccountDeletedEmail } = await import('./account-deleted');
      return <AccountDeletedEmail name={name} />;
    },
  });
