// ============================================================================
// RUTA: src/domain/repositories/ITradeRepository.ts
// ============================================================================

import type { Trade } from '@/domain/entities/Trade';
import type { TradeItem } from '@/domain/entities/types';
import type { Transactional } from '@/domain/repositories/transaction';
import type { TradeStatus } from '@/domain/value-objects/TradeStatus';
import type { DiscordUserSnapshot } from '@/shared/types/discord';

export interface CreateTradeData {
  readonly ticketId: number;
  readonly userId: bigint;
  readonly robloxUsername: string;
  readonly robloxUserId?: bigint | null;
  readonly status?: TradeStatus;
  readonly confirmed?: boolean;
  readonly items?: ReadonlyArray<TradeItem>;
  readonly userSnapshot?: DiscordUserSnapshot;
}

export interface ITradeRepository extends Transactional<ITradeRepository> {
  create(data: CreateTradeData): Promise<Trade>;
  findById(id: number): Promise<Trade | null>;
  findByTicketId(ticketId: number): Promise<readonly Trade[]>;
  findByUserId(userId: bigint): Promise<readonly Trade[]>;
  update(trade: Trade): Promise<void>;
  delete(id: number): Promise<void>;
}
