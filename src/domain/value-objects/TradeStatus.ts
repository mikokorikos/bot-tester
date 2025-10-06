// ============================================================================
// RUTA: src/domain/value-objects/TradeStatus.ts
// ============================================================================

export enum TradeStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class TradeStatusVO {
  public static canTransitionTo(from: TradeStatus, to: TradeStatus): boolean {
    if (from === to) {
      return true;
    }

    switch (from) {
      case TradeStatus.PENDING:
        return to === TradeStatus.ACTIVE || to === TradeStatus.CANCELLED;
      case TradeStatus.ACTIVE:
        return to === TradeStatus.COMPLETED || to === TradeStatus.CANCELLED;
      case TradeStatus.COMPLETED:
        return to === TradeStatus.CANCELLED;
      case TradeStatus.CANCELLED:
        return false;
      default:
        return false;
    }
  }
}
