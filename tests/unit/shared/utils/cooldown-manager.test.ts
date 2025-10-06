import { describe, expect, it } from 'vitest';

import { CooldownManager } from '@/shared/utils/cooldown-manager';

describe('CooldownManager', () => {
  it('allows first consumption and blocks until TTL expires', async () => {
    const manager = new CooldownManager();
    const key = 'ticket';
    const userId = '123';

    expect(manager.consume(key, userId, 100)).toBe(true);
    expect(manager.consume(key, userId, 100)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(manager.consume(key, userId, 100)).toBe(true);
  });
});
