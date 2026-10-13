import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, 'Ingresa tu nombre'),
    email: z.email('Correo inválido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
