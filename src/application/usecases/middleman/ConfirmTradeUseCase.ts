// ============================================================================
// RUTA: src/application/usecases/middleman/ConfirmTradeUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import { type ConfirmTradeDTO,ConfirmTradeSchema } from '@/application/dto/trade.dto';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import {
  TicketClosedError,
  TicketNotFoundError,
  TradeAlreadyConfirmedError,
  TradeDataNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

interface ConfirmTradeResult {
  readonly ticketConfirmed: boolean;
}

export class ConfirmTradeUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly tradeRepo: ITradeRepository,
    private readonly logger: Logger,
  ) {}

  public async execute(dto: ConfirmTradeDTO): Promise<ConfirmTradeResult> {
    const payload = ConfirmTradeSchema.parse(dto);
    const ticket = await this.ticketRepo.findById(payload.ticketId);

    if (!ticket) {
      throw new TicketNotFoundError(String(payload.ticketId));
    }

    if (!ticket.isOpen()) {
      throw new TicketClosedError(ticket.id);
    }

    const userId = BigInt(payload.userId);
    const isParticipant =
      ticket.isOwnedBy(userId) || (await this.ticketRepo.isParticipant(ticket.id, userId));

    if (!isParticipant) {
      throw new UnauthorizedActionError('middleman:trade:confirm');
    }

    const trades = await this.tradeRepo.findByTicketId(ticket.id);
    const trade = trades.find((current) => current.userId === userId) ?? null;

    if (!trade) {
      throw new TradeDataNotFoundError(payload.userId);
    }

    if (trade.confirmed) {
      throw new TradeAlreadyConfirmedError();
    }

    trade.confirm();
    await this.tradeRepo.update(trade);

    const everyoneHasTrade = trades.length >= 2;
    const allConfirmed = everyoneHasTrade && trades.every((current) => current.confirmed);

    if (allConfirmed) {
      ticket.confirm();
      await this.ticketRepo.update(ticket);

      this.logger.info(
        { ticketId: ticket.id, userId: payload.userId },
        'Ambas partes confirmaron el trade. Ticket marcado como listo.',
      );

      return { ticketConfirmed: true };
    }

    this.logger.info(
      { ticketId: ticket.id, userId: payload.userId },
      'Participante confirmó trade. A la espera del resto.',
    );

    return { ticketConfirmed: false };
  }
}
