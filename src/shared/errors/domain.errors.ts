// ============================================================================
// RUTA: src/shared/errors/domain.errors.ts
// ============================================================================

import { DedosError } from '@/shared/errors/base.error';

export class TicketNotFoundError extends DedosError {
  public constructor(ticketId: string) {
    super({
      code: 'TICKET_NOT_FOUND',
      message: `No se encontró el ticket con identificador ${ticketId}.`,
      metadata: { ticketId },
      exposeMessage: true,
    });
  }
}

export class UnauthorizedActionError extends DedosError {
  public constructor(action: string) {
    super({
      code: 'UNAUTHORIZED_ACTION',
      message: 'No tienes permisos para realizar esta acción.',
      metadata: { action },
      exposeMessage: true,
    });
  }
}

export class InvalidRatingError extends DedosError {
  public constructor(rating: number) {
    super({
      code: 'INVALID_RATING',
      message: 'La valoración debe estar entre 1 y 5 estrellas.',
      metadata: { rating },
      exposeMessage: true,
    });
  }
}

export class InvalidSnowflakeError extends DedosError {
  public constructor(value: string) {
    super({
      code: 'INVALID_SNOWFLAKE',
      message: 'El identificador de Discord proporcionado no es válido.',
      metadata: { value },
      exposeMessage: true,
    });
  }
}

export class InvalidTicketStateError extends DedosError {
  public constructor(current: unknown, expected: unknown) {
    super({
      code: 'INVALID_TICKET_STATE',
      message: 'El ticket no se encuentra en un estado válido para esta operación.',
      metadata: { current, expected },
      exposeMessage: true,
    });
  }
}

export class TicketAlreadyClaimedError extends DedosError {
  public constructor(ticketId: number) {
    super({
      code: 'TICKET_ALREADY_CLAIMED',
      message: 'Este ticket ya fue reclamado por otro middleman.',
      metadata: { ticketId },
      exposeMessage: true,
    });
  }
}

export class TooManyOpenTicketsError extends DedosError {
  public constructor(limit: number) {
    super({
      code: 'TOO_MANY_OPEN_TICKETS',
      message: `Has alcanzado el límite de ${limit} tickets abiertos simultáneamente.`,
      metadata: { limit },
      exposeMessage: true,
    });
  }
}

export class InvalidTradeStateError extends DedosError {
  public constructor(current: unknown, expected: unknown) {
    super({
      code: 'INVALID_TRADE_STATE',
      message: 'La transacción no está en un estado válido para completar la operación.',
      metadata: { current, expected },
      exposeMessage: true,
    });
  }
}

export class TradesNotConfirmedError extends DedosError {
  public constructor(ticketId: number) {
    super({
      code: 'TRADES_NOT_CONFIRMED',
      message: 'Existen participantes que no han confirmado la transacción.',
      metadata: { ticketId },
      exposeMessage: true,
    });
  }
}
export class FinalizationPendingError extends DedosError {
  public constructor(ticketId: number) {
    super({
      code: 'TRADE_FINALIZATION_PENDING',
      message: 'Ambos traders deben confirmar que el intercambio se completó antes de cerrar el ticket.',
      metadata: { ticketId },
      exposeMessage: true,
    });
  }
}


export class TradeDataNotFoundError extends DedosError {
  public constructor(userId: string) {
    super({
      code: 'TRADE_DATA_NOT_FOUND',
      message: 'Debes registrar tus datos de trade antes de confirmar.',
      metadata: { userId },
      exposeMessage: true,
    });
  }
}

export class TradeAlreadyConfirmedError extends DedosError {
  public constructor() {
    super({
      code: 'TRADE_ALREADY_CONFIRMED',
      message: 'Ya confirmaste tu participación en este trade.',
      exposeMessage: true,
    });
  }
}

export class ChannelCreationError extends DedosError {
  public constructor(reason?: string) {
    super({
      code: 'CHANNEL_CREATION_FAILED',
      message: 'No se pudo crear el canal en Discord.',
      metadata: { reason },
      exposeMessage: true,
    });
  }
}

export class ChannelCleanupError extends DedosError {
  public constructor(channelId: string, cause?: unknown) {
    super({
      code: 'CHANNEL_CLEANUP_FAILED',
      message: 'No se pudo limpiar el canal creado tras un error.',
      metadata: { channelId },
      exposeMessage: false,
      cause,
    });
  }
}

export class TicketClosedError extends DedosError {
  public constructor(ticketId: number) {
    super({
      code: 'TICKET_ALREADY_CLOSED',
      message: 'El ticket ya se encuentra cerrado.',
      metadata: { ticketId },
      exposeMessage: true,
    });
  }
}

export class MiddlemanNotFoundError extends DedosError {
  public constructor(userId: string) {
    super({
      code: 'MIDDLEMAN_NOT_FOUND',
      message: 'El middleman solicitado no está disponible.',
      metadata: { userId },
      exposeMessage: true,
    });
  }
}

export class TradeLimitExceededError extends DedosError {
  public constructor(limit: number) {
    super({
      code: 'TRADE_LIMIT_EXCEEDED',
      message: 'Has alcanzado el límite de transacciones simultáneas.',
      metadata: { limit },
      exposeMessage: true,
    });
  }
}

export class DuplicateReviewError extends DedosError {
  public constructor(ticketId: string, authorId: string) {
    super({
      code: 'DUPLICATE_REVIEW',
      message: 'Ya has enviado una reseña para este ticket.',
      metadata: { ticketId, authorId },
      exposeMessage: true,
    });
  }
}

export class DiscordEntityCreationError extends DedosError {
  public constructor(entity: string, cause?: unknown) {
    super({
      code: 'DISCORD_ENTITY_CREATION_FAILED',
      message: `No se pudo crear ${entity} en Discord.`,
      metadata: { entity },
      exposeMessage: true,
      cause,
    });
  }
}

export class DatabaseUnavailableError extends DedosError {
  public constructor(message = 'La base de datos no está disponible en este momento.') {
    super({
      code: 'DATABASE_UNAVAILABLE',
      message,
      exposeMessage: false,
    });
  }
}

export class ValidationFailedError extends DedosError {
  public constructor(details: Record<string, unknown>) {
    super({
      code: 'VALIDATION_FAILED',
      message: 'Los datos proporcionados no son válidos.',
      metadata: details,
      exposeMessage: true,
    });
  }
}

