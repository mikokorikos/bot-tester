// ============================================================================
// RUTA: src/domain/entities/Review.ts
// ============================================================================

import type { Rating } from '@/domain/value-objects/Rating';

export class Review {
  public constructor(
    public readonly id: number,
    public readonly ticketId: number,
    public readonly reviewerId: bigint,
    public readonly middlemanId: bigint,
    public readonly rating: Rating,
    public readonly comment: string | null,
    public readonly createdAt: Date,
  ) {}

  public isPositive(): boolean {
    return this.rating.isPositive();
  }

  public isNegative(): boolean {
    return this.rating.isNegative();
  }
}
