import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddWarnUseCase } from '@/application/usecases/warn/AddWarnUseCase';
import { Warn, WarnSeverity } from '@/domain/entities/Warn';
import type { CreateWarnData, IWarnRepository } from '@/domain/repositories/IWarnRepository';

class InMemoryWarnRepository implements IWarnRepository {
  private sequence = 1;
  private warns: Warn[] = [];

  public withTransaction(): IWarnRepository {
    return this;
  }

  public preload(warn: Warn): void {
    this.warns.push(warn);
  }

  public async create(data: CreateWarnData): Promise<Warn> {
    const warn = new Warn(
      this.sequence++,
      data.userId,
      data.moderatorId ?? null,
      data.severity,
      data.reason ?? null,
      new Date(),
    );
    this.warns.push(warn);

    return warn;
  }

  public async listByUser(userId: bigint): Promise<readonly Warn[]> {
    return this.warns.filter((warn) => warn.userId.toBigInt() === userId);
  }
}

const createMockLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as Logger);

describe('AddWarnUseCase', () => {
  let repository: InMemoryWarnRepository;
  let useCase: AddWarnUseCase;

  beforeEach(() => {
    repository = new InMemoryWarnRepository();
    const logger = createMockLogger();
    useCase = new AddWarnUseCase(repository, logger);

    repository.preload(new Warn(1, BigInt('123456789012345678'), null, WarnSeverity.MAJOR, null, new Date()));
    repository.preload(new Warn(2, BigInt('123456789012345678'), null, WarnSeverity.MAJOR, null, new Date()));
  });

  it('returns recommended action based on summary', async () => {
    const result = await useCase.execute({
      userId: '123456789012345678',
      moderatorId: '987654321098765432',
      severity: WarnSeverity.CRITICAL,
      reason: 'Prueba',
    });

    expect(result.summary.totalPoints).toBe(7);
    expect(result.summary.recommendedAction).toBe('BAN');
    expect(result.warn.severity).toBe(WarnSeverity.CRITICAL);
  });
});
