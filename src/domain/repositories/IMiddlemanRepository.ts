// ============================================================================
// RUTA: src/domain/repositories/IMiddlemanRepository.ts
// ============================================================================

import type { Transactional } from '@/domain/repositories/transaction';
import type { MiddlemanCardConfig } from '@/domain/value-objects/MiddlemanCardConfig';

export interface MiddlemanClaim {
  readonly ticketId: number;
  readonly middlemanId: bigint;
  readonly claimedAt: Date;
  readonly reviewRequestedAt?: Date | null;
  readonly closedAt?: Date | null;
  readonly forcedClose?: boolean;
  readonly panelMessageId?: bigint | null;
  readonly finalizationMessageId?: bigint | null;
}


export interface RobloxIdentityProfile {
  readonly id: number;
  readonly username: string;
  readonly robloxUserId: bigint | null;
  readonly verified: boolean;
  readonly lastUsedAt: Date | null;
}


export interface MiddlemanProfile {
  readonly userId: bigint;
  readonly primaryIdentity: RobloxIdentityProfile | null;
  readonly vouches: number;
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly cardConfig: MiddlemanCardConfig;
}


export interface IMiddlemanRepository extends Transactional<IMiddlemanRepository> {
  isMiddleman(userId: bigint): Promise<boolean>;
  getClaimByTicket(ticketId: number): Promise<MiddlemanClaim | null>;
  createClaim(ticketId: number, middlemanId: bigint): Promise<void>;
  markClosed(ticketId: number, payload: { closedAt: Date; forcedClose?: boolean }): Promise<void>;
  markReviewRequested(ticketId: number, requestedAt: Date): Promise<void>;
  setFinalizationMessageId(ticketId: number, messageId: bigint | null): Promise<void>;
  upsertProfile(data: {
    userId: bigint;
    robloxUsername: string;
    robloxUserId?: bigint | null;
    verified?: boolean;
    cardConfig?: MiddlemanCardConfig;
  }): Promise<void>;
  updateProfile(data: {
    userId: bigint;
    robloxUsername?: string | null;
    robloxUserId?: bigint | null;
    verified?: boolean;
    cardConfig?: MiddlemanCardConfig | null;
  }): Promise<void>;
  getProfile(userId: bigint): Promise<MiddlemanProfile | null>;
  listTopProfiles(limit?: number): Promise<readonly MiddlemanProfile[]>;
}


