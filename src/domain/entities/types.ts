// ============================================================================
// RUTA: src/domain/entities/types.ts
// ============================================================================

export enum TicketType {
  BUY = 'BUY',
  SELL = 'SELL',
  ROBUX = 'ROBUX',
  NITRO = 'NITRO',
  DECOR = 'DECOR',
  MM = 'MM',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  CONFIRMED = 'CONFIRMED',
  CLAIMED = 'CLAIMED',
  CLOSED = 'CLOSED',
}

export interface TradeItem {
  readonly id?: number;
  readonly name: string;
  readonly quantity: number;
  readonly metadata?: Record<string, unknown> | null;
}
