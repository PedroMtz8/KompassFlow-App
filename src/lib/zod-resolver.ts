import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Resolver mínimo de react-hook-form para esquemas Zod 4
 * (evita depender de @hookform/resolvers).
 */
export function zodResolver<TSchema extends z.ZodType<FieldValues>>(schema: TSchema): Resolver<z.infer<TSchema>> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (path && !errors[path]) errors[path] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<z.infer<TSchema>> };
  };
}
