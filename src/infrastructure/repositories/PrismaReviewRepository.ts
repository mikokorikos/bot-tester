// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaReviewRepository.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import { Review } from '@/domain/entities/Review';
import type { CreateReviewData, IReviewRepository } from '@/domain/repositories/IReviewRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';
import { Rating } from '@/domain/value-objects/Rating';
import { ensureUsersExist } from '@/infrastructure/repositories/utils/ensureUsersExist';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type PrismaReviewModel = Prisma.MiddlemanReviewGetPayload<Record<string, never>>;

export class PrismaReviewRepository implements IReviewRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): IReviewRepository {
    if (!PrismaReviewRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to review repository.');
    }

    return new PrismaReviewRepository(context);
  }

  public async create(data: CreateReviewData): Promise<Review> {
    await ensureUsersExist(this.prisma, [data.reviewerId]);

    const review = await this.prisma.middlemanReview.create({
      data: {
        ticketId: data.ticketId,
        reviewerId: data.reviewerId,
        middlemanId: data.middlemanId,
        rating: data.rating.getValue(),
        reviewText: data.comment ?? null,
      },
    });

    return this.toDomain(review);
  }

  public async findByTicketId(ticketId: number): Promise<readonly Review[]> {
    const reviews = await this.prisma.middlemanReview.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((review) => this.toDomain(review));
  }

  public async findByMiddlemanId(middlemanId: bigint): Promise<readonly Review[]> {
    const reviews = await this.prisma.middlemanReview.findMany({
      where: { middlemanId },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((review) => this.toDomain(review));
  }

  public async existsForTicketAndReviewer(ticketId: number, reviewerId: bigint): Promise<boolean> {
    const count = await this.prisma.middlemanReview.count({
      where: {
        ticketId,
        reviewerId,
      },
    });

    return count > 0;
  }

  public async calculateAverageRating(middlemanId: bigint): Promise<number> {
    const result = await this.prisma.middlemanReview.aggregate({
      where: { middlemanId },
      _avg: { rating: true },
    });

    return result._avg.rating ?? 0;
  }

  private toDomain(review: PrismaReviewModel): Review {
    const ratingResult = Rating.create(review.rating);
    if (ratingResult.isErr()) {
      throw ratingResult.unwrapErr();
    }

    const rating = ratingResult.unwrap();

    return new Review(
      review.id,
      review.ticketId,
      review.reviewerId,
      review.middlemanId,
      rating,
      review.reviewText ?? null,
      review.createdAt,
    );
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'middlemanReview' in value;
  }
}
