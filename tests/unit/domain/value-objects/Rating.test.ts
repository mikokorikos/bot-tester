import { describe, expect, it } from 'vitest';

import { Rating } from '@/domain/value-objects/Rating';

describe('Rating Value Object', () => {
  it('should create valid rating', () => {
    const rating = Rating.create(5);
    expect(rating.isOk()).toBe(true);
    expect(rating.unwrap().getValue()).toBe(5);
  });

  it('should reject rating below 1', () => {
    const rating = Rating.create(0);
    expect(rating.isErr()).toBe(true);
  });

  it('should reject rating above 5', () => {
    const rating = Rating.create(6);
    expect(rating.isErr()).toBe(true);
  });

  it('should identify positive ratings', () => {
    const rating = Rating.create(4).unwrap();
    expect(rating.isPositive()).toBe(true);
    expect(rating.isNegative()).toBe(false);
  });

  it('should identify negative ratings', () => {
    const rating = Rating.create(1).unwrap();
    expect(rating.isNegative()).toBe(true);
    expect(rating.isPositive()).toBe(false);
  });
});
