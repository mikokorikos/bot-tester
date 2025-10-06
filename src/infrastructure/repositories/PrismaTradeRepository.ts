// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaTradeRepository.ts
// ============================================================================

import { Prisma, type PrismaClient } from '@prisma/client';

import { Trade } from '@/domain/entities/Trade';
import type { TradeItem } from '@/domain/entities/types';
import type { CreateTradeData, ITradeRepository } from '@/domain/repositories/ITradeRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { ensureUsersExist } from '@/infrastructure/repositories/utils/ensureUsersExist';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type PrismaTradeWithItems = Prisma.MiddlemanTradeGetPayload<{
  include: { items: true };
}>;

const mapItemToPrisma = (item: TradeItem) => ({
  itemName: item.name,
  quantity: item.quantity,
  metadata:
    item.metadata === undefined || item.metadata === null
      ? Prisma.JsonNull
      : (item.metadata as Prisma.InputJsonValue),
});

const mapItemFromPrisma = (item: Prisma.MiddlemanTradeItemGetPayload<Record<string, never>>) => ({
  id: item.id,
  name: item.itemName,
  quantity: item.quantity,
  metadata:
    typeof item.metadata === 'object' && item.metadata !== null
      ? (item.metadata as Record<string, unknown>)
      : null,
});

const hasTransactionMethod = (
  client: PrismaClientLike,
): client is PrismaClient => typeof (client as PrismaClient).$transaction === 'function';

export class PrismaTradeRepository implements ITradeRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): ITradeRepository {
    if (!PrismaTradeRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to trade repository.');
    }

    return new PrismaTradeRepository(context);
  }

  public async create(data: CreateTradeData): Promise<Trade> {
    await ensureUsersExist(this.prisma, [data.userSnapshot ?? data.userId]);

    const identity = await this.resolveRobloxIdentity(this.prisma, {
      userId: data.userId,
      username: data.robloxUsername,
      robloxUserId: data.robloxUserId,
    });

    const trade = await this.prisma.middlemanTrade.create({
      data: {
        ticketId: data.ticketId,
        userId: data.userId,
        robloxIdentityId: identity.id,
        robloxUsername: data.robloxUsername,
        robloxUserId: data.robloxUserId ?? identity.robloxUserId ?? null,
        status: data.status ?? TradeStatus.PENDING,
        confirmed: data.confirmed ?? false,
        items: data.items
          ? {
              create: data.items.map(mapItemToPrisma),
            }
          : undefined,
      },
      include: { items: true },
    });

    return this.toDomain(trade);
  }

  public async findById(id: number): Promise<Trade | null> {
    const trade = await this.prisma.middlemanTrade.findUnique({
      where: { id },
      include: { items: true },
    });

    return trade ? this.toDomain(trade) : null;
  }

  public async findByTicketId(ticketId: number): Promise<readonly Trade[]> {
    const trades = await this.prisma.middlemanTrade.findMany({
      where: { ticketId },
      include: { items: true },
    });

    return trades.map((trade) => this.toDomain(trade));
  }

  public async findByUserId(userId: bigint): Promise<readonly Trade[]> {
    const trades = await this.prisma.middlemanTrade.findMany({
      where: { userId },
      include: { items: true },
    });

    return trades.map((trade) => this.toDomain(trade));
  }

  public async update(trade: Trade): Promise<void> {
    const itemsData = trade.items.map((item) => ({
      tradeId: trade.id,
      ...mapItemToPrisma(item),
    }));

    const run = async (client: Prisma.TransactionClient | PrismaClient): Promise<void> => {
      const identity = await this.resolveRobloxIdentity(client, {
        userId: trade.userId,
        username: trade.robloxUsername,
        robloxUserId: trade.robloxUserId,
      });

      const resolvedRobloxUserId = trade.robloxUserId ?? identity.robloxUserId ?? null;

      await client.middlemanTrade.update({
        where: { id: trade.id },
        data: {
          status: trade.status,
          confirmed: trade.confirmed,
          robloxUserId: resolvedRobloxUserId,
          robloxUsername: trade.robloxUsername,
          robloxIdentityId: identity.id,
        },
      });

      await client.middlemanTradeItem.deleteMany({ where: { tradeId: trade.id } });

      if (itemsData.length > 0) {
        await client.middlemanTradeItem.createMany({
          data: itemsData,
        });
      }

      trade.updateRobloxProfile({ userId: resolvedRobloxUserId, identityId: identity.id });
    };

    if (hasTransactionMethod(this.prisma)) {
      await this.prisma.$transaction(async (tx) => {
        await run(tx);
      });
      return;
    }

    await run(this.prisma);
  }

  public async delete(id: number): Promise<void> {
    await this.prisma.middlemanTrade.delete({ where: { id } });
  }

  private toDomain(trade: PrismaTradeWithItems): Trade {
    return new Trade(
      trade.id,
      trade.ticketId,
      trade.userId,
      trade.robloxUsername,
      trade.robloxUserId,
      trade.robloxIdentityId ?? null,
      trade.status as TradeStatus,
      trade.confirmed,
      trade.items.map(mapItemFromPrisma),
      trade.createdAt,
    );
  }

  private async resolveRobloxIdentity(
    client: PrismaClientLike,
    payload: { userId: bigint; username: string; robloxUserId?: bigint | null },
  ): Promise<{ id: number; robloxUserId: bigint | null }> {
    // FIX: Explicitly reuse PrismaClient delegate typing to access model upserts from union client sources.
    const prisma = client as PrismaClient;

    const identity = await prisma.userRobloxIdentity.upsert({
      where: { userId_robloxUsername: { userId: payload.userId, robloxUsername: payload.username } },
      update: {
        robloxUserId:
          payload.robloxUserId === undefined ? undefined : payload.robloxUserId ?? null,
        lastUsedAt: new Date(),
      },
      create: {
        userId: payload.userId,
        robloxUsername: payload.username,
        robloxUserId: payload.robloxUserId ?? null,
        lastUsedAt: new Date(),
      },
    });

    return { id: identity.id, robloxUserId: identity.robloxUserId ?? null };
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'middlemanTrade' in value;
  }
}
