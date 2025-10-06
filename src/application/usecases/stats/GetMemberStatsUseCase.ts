// ============================================================================
// RUTA: src/application/usecases/stats/GetMemberStatsUseCase.ts
// ============================================================================

import { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import type { IMemberStatsRepository } from '@/domain/repositories/IMemberStatsRepository';

export interface MemberStatsResult {
  readonly stats: MemberTradeStats;
  readonly leaderboard: readonly MemberTradeStats[];
}

export class GetMemberStatsUseCase {
  public constructor(private readonly statsRepository: IMemberStatsRepository) {}

  public async execute(userId: bigint): Promise<MemberStatsResult> {
    const [stats, leaderboard] = await Promise.all([
      this.statsRepository.getByUserId(userId),
      this.statsRepository.topMembers(5),
    ]);

    return {
      stats: stats ?? new MemberTradeStats(userId, 0, null, null, null, null, new Date()),
      leaderboard,
    };
  }
}
