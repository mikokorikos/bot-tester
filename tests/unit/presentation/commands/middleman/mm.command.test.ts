import { describe, expect, it } from 'vitest';

import { middlemanDirectoryCommand } from '@/presentation/commands/middleman/mm';

describe('middleman directory command', () => {
  it('serializes with valid description lengths', () => {
    const json = middlemanDirectoryCommand.data.toJSON();

    expect(json.description.length).toBeLessThanOrEqual(100);
    for (const option of json.options ?? []) {
      if (typeof option.description === 'string') {
        expect(option.description.length).toBeLessThanOrEqual(100);
      }
    }
  });
});
