// ============================================================================
// RUTA: src/domain/repositories/IReviewRepository.ts
// ============================================================================

import type { Review } from '@/domain/entities/Review';
import type { Transactional } from '@/domain/repositories/transaction';
import type { Rating } from '@/domain/value-objects/Rating';

export interface CreateReviewData {
  readonly ticketId: number;
  readonly reviewerId: bigint;
  readonly middlemanId: bigint;
  readonly rating: Rating;
  readonly comment?: string | null;
}

export interface IReviewRepository extends Transactional<IReviewRepository> {
  create(data: CreateReviewData): Promise<Review>;
  findByTicketId(ticketId: number): Promise<readonly Review[]>;
  findByMiddlemanId(middlemanId: bigint): Promise<readonly Review[]>;
  existsForTicketAndReviewer(ticketId: number, reviewerId: bigint): Promise<boolean>;
  calculateAverageRating(middlemanId: bigint): Promise<number>;
}
