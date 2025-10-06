// ============================================================================
// RUTA: src/application/dto/trade.dto.ts
// ============================================================================

import { z } from 'zod';

const SnowflakeSchema = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/u, 'Invalid Discord ID');

export const SubmitTradeDataSchema = z.object({
  ticketId: z.number().int().positive('Invalid ticket identifier'),
  userId: SnowflakeSchema,
  robloxUsername: z
    .string()
    .trim()
    .min(3, 'El usuario de Roblox debe tener al menos 3 caracteres.')
    .max(50, 'El usuario de Roblox no puede exceder 50 caracteres.'),
  offerDescription: z
    .string()
    .trim()
    .min(5, 'Describe brevemente qué ofreces en el trade.')
    .max(1000, 'La descripción del trade no puede exceder 1000 caracteres.'),
});

export type SubmitTradeDataDTO = z.infer<typeof SubmitTradeDataSchema>;

export const ConfirmTradeSchema = z.object({
  ticketId: z.number().int().positive('Invalid ticket identifier'),
  userId: SnowflakeSchema,
});

export type ConfirmTradeDTO = z.infer<typeof ConfirmTradeSchema>;
