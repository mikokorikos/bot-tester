// ============================================================================
// RUTA: src/domain/repositories/IMemberStatsRepository.ts
// ============================================================================

import type { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import type { Transactional } from '@/domain/repositories/transaction';

export interface TradeMetadata {
  readonly robloxUsername?: string | null;
  readonly robloxUserId?: bigint | null;
  readonly partnerTag?: string | null;
}

export interface IMemberStatsRepository extends Transactional<IMemberStatsRepository> {
  recordCompletedTrade(userId: bigint, completedAt: Date, metadata?: TradeMetadata): Promise<MemberTradeStats>;
  getByUserId(userId: bigint): Promise<MemberTradeStats | null>;
  topMembers(limit: number): Promise<readonly MemberTradeStats[]>;
}
