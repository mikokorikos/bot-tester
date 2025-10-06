// =============================================================================
// RUTA: src/domain/repositories/IWarnRepository.ts
// =============================================================================

import type { Warn, WarnSeverity } from '@/domain/entities/Warn';
import type { Transactional } from '@/domain/repositories/transaction';

export interface CreateWarnData {
  readonly userId: bigint;
  readonly moderatorId?: bigint | null;
  readonly severity: WarnSeverity;
  readonly reason?: string | null;
}

export interface WarnSummary {
  readonly total: number;
  readonly weightedScore: number;
  readonly lastWarnAt: Date | null;
}

export interface IWarnRepository extends Transactional<IWarnRepository> {
  create(data: CreateWarnData): Promise<Warn>;
  listByUser(userId: bigint): Promise<readonly Warn[]>;
  remove(id: number): Promise<void>;
  getSummary(userId: bigint): Promise<WarnSummary>;
}
