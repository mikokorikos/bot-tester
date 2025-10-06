// ============================================================================
// RUTA: src/domain/repositories/IMiddlemanFinalizationRepository.ts
// ============================================================================

import type { Transactional } from '@/domain/repositories/transaction';

export interface IMiddlemanFinalizationRepository
  extends Transactional<IMiddlemanFinalizationRepository> {
  listByTicket(ticketId: number): Promise<readonly bigint[]>;
  confirm(ticketId: number, userId: bigint): Promise<void>;
  revoke(ticketId: number, userId: bigint): Promise<void>;
  reset(ticketId: number): Promise<void>;
}
