// ============================================================================
// RUTA: src/application/dto/warn.dto.ts
// ============================================================================

import { z } from 'zod';

import { WarnSeverity } from '@/domain/entities/Warn';
import { SnowflakeSchema } from '@/shared/utils/validation';

export const AddWarnSchema = z.object({
  userId: SnowflakeSchema,
  moderatorId: SnowflakeSchema,
  severity: z.nativeEnum(WarnSeverity),
  reason: z.string().max(400).optional(),
});

export const RemoveWarnSchema = z.object({
  warnId: z.number().int().positive(),
});

export const ListWarnsSchema = z.object({
  userId: SnowflakeSchema,
});

export type AddWarnDTO = z.infer<typeof AddWarnSchema>;
export type RemoveWarnDTO = z.infer<typeof RemoveWarnSchema>;
export type ListWarnsDTO = z.infer<typeof ListWarnsSchema>;
