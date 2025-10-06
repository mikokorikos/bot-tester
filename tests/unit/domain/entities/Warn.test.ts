import { describe, expect, it } from 'vitest';

import { Warn, WarnSeverity } from '@/domain/entities/Warn';

describe('Warn entity', () => {
  it('computes weight based on severity', () => {
    const baseDate = new Date('2024-01-01T00:00:00.000Z');
    const warnMinor = new Warn(1, 1n, null, WarnSeverity.MINOR, null, baseDate);
    const warnMajor = new Warn(2, 1n, null, WarnSeverity.MAJOR, null, baseDate);
    const warnCritical = new Warn(3, 1n, null, WarnSeverity.CRITICAL, null, baseDate);

    expect(warnMinor.weight).toBe(1);
    expect(warnMajor.weight).toBe(2);
    expect(warnCritical.weight).toBe(3);
  });

  it('flags critical warns', () => {
    const warn = new Warn(1, 1n, null, WarnSeverity.CRITICAL, null, new Date());

    expect(warn.isCritical()).toBe(true);
  });
});
