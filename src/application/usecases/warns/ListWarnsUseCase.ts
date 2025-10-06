// ============================================================================
// RUTA: src/application/usecases/warns/ListWarnsUseCase.ts
// ============================================================================

import { type ListWarnsDTO, ListWarnsSchema } from '@/application/dto/warn.dto';
import type { Warn } from '@/domain/entities/Warn';
import type { IWarnRepository, WarnSummary } from '@/domain/repositories/IWarnRepository';

export interface ListWarnsResult {
  readonly warns: readonly Warn[];
  readonly summary: WarnSummary;
}

export class ListWarnsUseCase {
  public constructor(private readonly warnRepository: IWarnRepository) {}

  public async execute(payload: ListWarnsDTO): Promise<ListWarnsResult> {
    const data = ListWarnsSchema.parse(payload);
    const userId = BigInt(data.userId);

    const [warns, summary] = await Promise.all([
      this.warnRepository.listByUser(userId),
      this.warnRepository.getSummary(userId),
    ]);

    return { warns, summary };
  }
}
