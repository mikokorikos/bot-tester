// ============================================================================
// RUTA: src/application/usecases/middleman/SubmitTradeDataUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import { type SubmitTradeDataDTO, SubmitTradeDataSchema } from '@/application/dto/trade.dto';
import type { Trade } from '@/domain/entities/Trade';
import type { TradeItem } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import {
  TicketClosedError,
  TicketNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

const DESCRIPTION_MAX_LENGTH = 240;

const buildTradeItem = (description: string): TradeItem => ({
  name: description.slice(0, DESCRIPTION_MAX_LENGTH),
  quantity: 1,
  metadata: { description },
});

export class SubmitTradeDataUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly tradeRepo: ITradeRepository,
    private readonly logger: Logger,
  ) {}

  public async execute(dto: SubmitTradeDataDTO): Promise<Trade> {
    const payload = SubmitTradeDataSchema.parse(dto);
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
      throw new UnauthorizedActionError('middleman:trade:data');
    }

    const trades = await this.tradeRepo.findByTicketId(ticket.id);
    const existingTrade = trades.find((trade) => trade.userId === userId) ?? null;
    const normalizedDescription = payload.offerDescription.trim();
    const item = buildTradeItem(normalizedDescription);

    if (existingTrade) {
      existingTrade.updateRobloxProfile({ username: payload.robloxUsername });
      existingTrade.replaceItems([item]);
      existingTrade.resetConfirmation();

      await this.tradeRepo.update(existingTrade);
      this.logger.info(
        {
          ticketId: ticket.id,
          userId: payload.userId,
        },
        'Datos de trade actualizados.',
      );

      return existingTrade;
    }

    const trade = await this.tradeRepo.create({
      ticketId: ticket.id,
      userId,
      robloxUsername: payload.robloxUsername,
      items: [item],
    });

    this.logger.info(
      {
        ticketId: ticket.id,
        userId: payload.userId,
      },
      'Datos de trade registrados por primera vez.',
    );

    return trade;
  }
}
