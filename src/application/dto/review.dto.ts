// ============================================================================
// RUTA: src/application/dto/review.dto.ts
// ============================================================================

import { z } from 'zod';

export const SubmitReviewSchema = z.object({
  ticketId: z.number().int().positive(),
  reviewerId: z.string().regex(/^\d+$/u, 'Invalid Discord ID'),
  middlemanId: z.string().regex(/^\d+$/u, 'Invalid Discord ID'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  middlemanDisplayName: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional(),
  middlemanAvatarUrl: z.string().url().optional(),
});

export type SubmitReviewDTO = z.infer<typeof SubmitReviewSchema>;
