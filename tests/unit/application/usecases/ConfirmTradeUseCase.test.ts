import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfirmTradeDTO } from '@/application/dto/trade.dto';
import { ConfirmTradeUseCase } from '@/application/usecases/middleman/ConfirmTradeUseCase';
import { Ticket } from '@/domain/entities/Ticket';
import { Trade } from '@/domain/entities/Trade';
import { TicketStatus, TicketType } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { UnauthorizedActionError } from '@/shared/errors/domain.errors';

class ConfirmTicketRepository implements ITicketRepository {
  public ticket: Ticket | null = null;
  public participants = new Set<string>();
  public updated = false;

  public withTransaction(): ITicketRepository {
    return this;
  }

  public async create(): Promise<Ticket> {
    throw new Error('not implemented');
  }

  public async findById(id: number): Promise<Ticket | null> {
    if (!this.ticket || this.ticket.id !== id) {
      return null;
    }
    return this.ticket;
  }

  public async findByChannelId(): Promise<Ticket | null> {
    return null;
  }

  public async findOpenByOwner(): Promise<readonly Ticket[]> {
    return [];
  }

  public async update(ticket: Ticket): Promise<void> {
    this.ticket = ticket;
    this.updated = true;
  }

  public async delete(): Promise<void> {}

  public async countOpenByOwner(): Promise<number> {
    return 0;
  }

  public async isParticipant(ticketId: number, userId: bigint): Promise<boolean> {
    return this.ticket?.id === ticketId && this.participants.has(userId.toString());
  }

  public async listParticipants(): Promise<readonly { userId: bigint; role?: string | null; joinedAt?: Date }[]> {
    return Array.from(this.participants).map((userId) => ({ userId: BigInt(userId) }));
  }
}

class ConfirmTradeRepository implements ITradeRepository {
  public trades: Trade[] = [];

  public withTransaction(): ITradeRepository {
    return this;
  }

  public async create(): Promise<Trade> {
    throw new Error('not implemented');
  }

  public async findById(): Promise<Trade | null> {
    return null;
  }

  public async findByTicketId(ticketId: number): Promise<readonly Trade[]> {
    return this.trades.filter((trade) => trade.ticketId === ticketId);
  }

  public async findByUserId(): Promise<readonly Trade[]> {
    return [];
  }

  public async update(): Promise<void> {}

  public async delete(): Promise<void> {}
}

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as Logger);

describe('ConfirmTradeUseCase', () => {
  const OWNER_ID = '111111111111111111';
  const PARTNER_ID = '222222222222222222';
  const OTHER_ID = '333333333333333333';
  let ticketRepo: ConfirmTicketRepository;
  let tradeRepo: ConfirmTradeRepository;
  let useCase: ConfirmTradeUseCase;

  beforeEach(() => {
    ticketRepo = new ConfirmTicketRepository();
    tradeRepo = new ConfirmTradeRepository();
    useCase = new ConfirmTradeUseCase(ticketRepo, tradeRepo, createLogger());

    ticketRepo.ticket = new Ticket(1, BigInt(OWNER_ID), BigInt(2), BigInt(PARTNER_ID), TicketType.MM, TicketStatus.OPEN, new Date());
    ticketRepo.participants = new Set([OWNER_ID, PARTNER_ID]);

    const tradeA = new Trade(1, 1, BigInt(OWNER_ID), 'TraderA', null, null, TradeStatus.PENDING, false, [], new Date());
    const tradeB = new Trade(2, 1, BigInt(PARTNER_ID), 'TraderB', null, null, TradeStatus.PENDING, false, [], new Date());
    tradeRepo.trades = [tradeA, tradeB];
  });

  it('confirms ticket when both trades are confirmed', async () => {
    const dto: ConfirmTradeDTO = { ticketId: 1, userId: OWNER_ID };

    const result = await useCase.execute(dto);

    expect(result.ticketConfirmed).toBe(false);
    expect(tradeRepo.trades[0].confirmed).toBe(true);
    expect(ticketRepo.ticket?.status).toBe(TicketStatus.OPEN);

    const secondResult = await useCase.execute({ ticketId: 1, userId: PARTNER_ID });

    expect(secondResult.ticketConfirmed).toBe(true);
    expect(ticketRepo.ticket?.status).toBe(TicketStatus.CONFIRMED);
    expect(ticketRepo.updated).toBe(true);
  });

  it('throws when user is not participant', async () => {
    const dto: ConfirmTradeDTO = { ticketId: 1, userId: OTHER_ID };

    await expect(useCase.execute(dto)).rejects.toThrow(UnauthorizedActionError);
  });
});
