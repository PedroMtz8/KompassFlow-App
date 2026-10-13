import { env } from '../env';
import { sendEmail } from '../lib/email';
import { AccountDeletedEmail } from './account-deleted';
import { ClassCanceledEmail } from './class-canceled';
import { InvitationEmail } from './invitation';
import { ResetPasswordEmail } from './reset-password';
import { VerifyEmailEmail } from './verify-email';

/** Un envío por tipo de correo: es lo que usa el resto del servidor (sin tocar JSX). */

export const sendResetPassword = (user: { email: string; name: string }, url: string) =>
  sendEmail({ to: user.email, subject: 'Restablece tu contraseña de KompasFlow', react: <ResetPasswordEmail name={user.name} url={url} /> });

export const sendVerifyEmail = (user: { email: string; name: string }, url: string) =>
  sendEmail({ to: user.email, subject: 'Confirma tu correo de KompasFlow', react: <VerifyEmailEmail name={user.name} url={url} /> });

export const sendInvitation = (to: string, data: { inviter: string; organization: string; role: string }) =>
  sendEmail({
    to,
    subject: `${data.inviter} te invitó a ${data.organization}`,
    react: <InvitationEmail {...data} url={`${env.appUrl}/sign-in`} />,
  });

export const sendClassCanceled = (to: string, data: { name: string; organization: string; service: string; when: string }) =>
  sendEmail({
    to,
    subject: `Se canceló ${data.service} de ${data.organization}`,
    react: <ClassCanceledEmail {...data} url={`${env.appUrl}/discover`} />,
  });

export const sendAccountDeleted = (to: string, name: string) =>
  sendEmail({ to, subject: 'Eliminamos tu cuenta de KompasFlow', react: <AccountDeletedEmail name={name} /> });
