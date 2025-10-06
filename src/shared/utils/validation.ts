// ============================================================================
// RUTA: src/shared/utils/validation.ts
// ============================================================================

import { z } from 'zod';

import { isValidSnowflake } from '@/shared/utils/discord.utils';

export const SnowflakeSchema = z
  .string({ required_error: 'El identificador de Discord es obligatorio.' })
  .refine((value) => isValidSnowflake(value), {
    message: 'Debe ser un snowflake válido de Discord.',
  });

export const RatingSchema = z
  .number({ required_error: 'La calificación es obligatoria.' })
  .int()
  .min(1, 'La calificación mínima es 1.')
  .max(5, 'La calificación máxima es 5.');

export const OptionalStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const PositiveIntSchema = z
  .number()
  .int()
  .min(1);

export const PaginationSchema = z.object({
  page: PositiveIntSchema.default(1),
  pageSize: PositiveIntSchema.max(100).default(20),
});

export const IsoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Debe ser una fecha ISO válida.',
  });
