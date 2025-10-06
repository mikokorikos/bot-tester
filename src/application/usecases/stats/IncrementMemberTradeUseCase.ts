// ============================================================================
// RUTA: src/application/usecases/stats/IncrementMemberTradeUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import type { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import type { IMemberStatsRepository, TradeMetadata } from '@/domain/repositories/IMemberStatsRepository';

export class IncrementMemberTradeUseCase {
  public constructor(private readonly statsRepository: IMemberStatsRepository, private readonly logger: Logger) {}

  public async execute(
    userId: bigint,
    completedAt: Date,
    metadata?: TradeMetadata,
  ): Promise<MemberTradeStats> {
    const stats = await this.statsRepository.recordCompletedTrade(userId, completedAt, metadata);

    this.logger.debug({ userId: userId.toString(), tradesCompleted: stats.tradesCompleted }, 'Estadísticas de trade actualizadas.');

    return stats;
  }
}
