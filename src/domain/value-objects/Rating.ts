// ============================================================================
// RUTA: src/domain/value-objects/Rating.ts
// ============================================================================

import { InvalidRatingError } from '@/shared/errors/domain.errors';
import { err, ok, type Result } from '@/shared/utils/result';

/**
 * Value object que representa las valoraciones de reseñas (1-5).
 */
export class Rating {
  private constructor(private readonly value: number) {}

  public static create(stars: number): Result<Rating, InvalidRatingError> {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return err(new InvalidRatingError(stars));
    }

    return ok(new Rating(stars));
  }

  public getValue(): number {
    return this.value;
  }

  public isPositive(): boolean {
    return this.value >= 4;
  }

  public isNegative(): boolean {
    return this.value <= 2;
  }
}
