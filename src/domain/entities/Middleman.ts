// ============================================================================
// RUTA: src/domain/entities/Middleman.ts
// ============================================================================

import type { Rating } from '@/domain/value-objects/Rating';

export interface MiddlemanMetrics {
  readonly completedTrades: number;
  readonly averageRating: number;
}

export class Middleman {
  public constructor(
    public readonly userId: bigint,
    public readonly robloxUsername: string,
    public readonly robloxUserId: bigint | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    private readonly metrics: MiddlemanMetrics,
  ) {}

  public get displayName(): string {
    return this.robloxUsername || `Middleman ${this.userId}`;
  }

  public get completedTrades(): number {
    return this.metrics.completedTrades;
  }

  public get averageRating(): number {
    return this.metrics.averageRating;
  }

  public get standing(): 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'AT_RISK' {
    if (this.metrics.completedTrades === 0) {
      return 'AVERAGE';
    }

    if (this.metrics.averageRating >= 4.5) {
      return 'EXCELLENT';
    }

    if (this.metrics.averageRating >= 3.5) {
      return 'GOOD';
    }

    if (this.metrics.averageRating >= 2.5) {
      return 'AVERAGE';
    }

    return 'AT_RISK';
  }

  public withUpdatedMetrics(rating: Rating): Middleman {
    const totalRating = this.metrics.averageRating * this.metrics.completedTrades + rating.getValue();
    const totalTrades = this.metrics.completedTrades + 1;

    return new Middleman(
      this.userId,
      this.robloxUsername,
      this.robloxUserId,
      this.createdAt,
      this.updatedAt,
      {
        completedTrades: totalTrades,
        averageRating: totalRating / totalTrades,
      },
    );
  }
}
