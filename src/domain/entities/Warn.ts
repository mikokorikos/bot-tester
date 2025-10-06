// =============================================================================
// RUTA: src/domain/entities/Warn.ts
// =============================================================================

import { UserId } from '@/domain/value-objects/UserId';

export enum WarnSeverity {
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  CRITICAL = 'CRITICAL',
}

const WEIGHT_BY_SEVERITY: Record<WarnSeverity, number> = {
  [WarnSeverity.MINOR]: 1,
  [WarnSeverity.MAJOR]: 2,
  [WarnSeverity.CRITICAL]: 3,
};

export class Warn {
  public readonly id: number;

  public readonly userId: UserId;

  public readonly moderatorId: UserId | null;

  public readonly severity: WarnSeverity;

  public readonly reason: string | null;

  public readonly createdAt: Date;

  public constructor(
    id: number,
    userId: bigint,
    moderatorId: bigint | null,
    severity: WarnSeverity,
    reason: string | null,
    createdAt: Date,
  ) {
    this.id = id;
    this.userId = UserId.fromBigInt(userId);
    this.moderatorId = moderatorId ? UserId.fromBigInt(moderatorId) : null;
    this.severity = severity;
    this.reason = reason;
    this.createdAt = createdAt;
  }

  public get weight(): number {
    return WEIGHT_BY_SEVERITY[this.severity];
  }

  public isCritical(): boolean {
    return this.severity === WarnSeverity.CRITICAL;
  }
}

export const warnSeverityWeight = (severity: WarnSeverity): number => WEIGHT_BY_SEVERITY[severity];
