// ============================================================================
// RUTA: tests/unit/infrastructure/repositories/PrismaTradeRepository.test.ts
// ============================================================================

import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { Trade } from '@/domain/entities/Trade';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { PrismaTradeRepository } from '@/infrastructure/repositories/PrismaTradeRepository';

const buildTrade = (items: Parameters<Trade['replaceItems']>[0]): Trade =>
  new Trade(
    42,
    7,
    BigInt('123456789012345678'),
    'JohnDoe',
    null,
    null,
    TradeStatus.ACTIVE,
    true,
    items,
    new Date('2024-01-01T00:00:00.000Z'),
  );

describe('PrismaTradeRepository.update', () => {
  it('ejecuta la actualización dentro de una transacción cuando el cliente la soporta', async () => {
    const innerUpdate = vi.fn(async () => {});
    const innerDeleteMany = vi.fn(async () => {});
    const innerCreateMany = vi.fn(async () => {});

    const identity = { id: 73, robloxUserId: BigInt('987654321098765432') };

    const txStub = {
      middlemanTrade: { update: innerUpdate },
      middlemanTradeItem: { deleteMany: innerDeleteMany, createMany: innerCreateMany },
      userRobloxIdentity: { upsert: vi.fn().mockResolvedValue(identity) },
    } satisfies Partial<Prisma.TransactionClient>;

    const outerUpdate = vi.fn();
    const outerDeleteMany = vi.fn();
    const outerCreateMany = vi.fn();

    const prismaClientMock = {
      middlemanTrade: { update: outerUpdate },
      middlemanTradeItem: { deleteMany: outerDeleteMany, createMany: outerCreateMany },
      $transaction: vi.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<void>) => {
        await callback(txStub as Prisma.TransactionClient);
      }),
      userRobloxIdentity: { upsert: vi.fn().mockResolvedValue(identity) },
    };

    const repository = new PrismaTradeRepository(prismaClientMock as unknown as PrismaClient);
    const trade = buildTrade([
      { name: 'Item A', quantity: 1, metadata: { description: 'Oferta A' } },
      { name: 'Item B', quantity: 2, metadata: null },
    ]);

    await repository.update(trade);

    expect(prismaClientMock.$transaction).toHaveBeenCalledTimes(1);
    expect(innerUpdate).toHaveBeenCalledWith({
      where: { id: trade.id },
      data: {
        status: trade.status,
        confirmed: trade.confirmed,
        robloxUserId: identity.robloxUserId,
        robloxUsername: trade.robloxUsername,
        robloxIdentityId: identity.id,
      },
    });
    expect(innerDeleteMany).toHaveBeenCalledWith({ where: { tradeId: trade.id } });
    expect(innerCreateMany).toHaveBeenCalledWith({
      data: [
        {
          tradeId: trade.id,
          itemName: 'Item A',
          quantity: 1,
          metadata: { description: 'Oferta A' },
        },
        {
          tradeId: trade.id,
          itemName: 'Item B',
          quantity: 2,
          metadata: Prisma.JsonNull,
        },
      ],
    });
    expect(outerUpdate).not.toHaveBeenCalled();
    expect(outerDeleteMany).not.toHaveBeenCalled();
    expect(outerCreateMany).not.toHaveBeenCalled();
    expect(txStub.userRobloxIdentity?.upsert).toHaveBeenCalled();
    expect(trade.robloxUserId).toBe(identity.robloxUserId);
    expect(trade.robloxIdentityId).toBe(identity.id);
  });

  it('reutiliza el cliente transaccional cuando no se dispone de $transaction', async () => {
    const identity = { id: 81, robloxUserId: BigInt('111222333444555666') };
    const update = vi.fn(async () => {});
    const deleteMany = vi.fn(async () => {});
    const createMany = vi.fn(async () => {});
    const upsertIdentity = vi.fn().mockResolvedValue(identity);

    const transactionClient = {
      middlemanTrade: { update },
      middlemanTradeItem: { deleteMany, createMany },
      userRobloxIdentity: { upsert: upsertIdentity },
    } as unknown as Prisma.TransactionClient;

    const repository = new PrismaTradeRepository(transactionClient);
    const trade = buildTrade([]);

    await repository.update(trade);

    expect(update).toHaveBeenCalledWith({
      where: { id: trade.id },
      data: {
        status: trade.status,
        confirmed: trade.confirmed,
        robloxUserId: identity.robloxUserId,
        robloxUsername: trade.robloxUsername,
        robloxIdentityId: identity.id,
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { tradeId: trade.id } });
    expect(createMany).not.toHaveBeenCalled();
    expect(upsertIdentity).toHaveBeenCalled();
    expect(trade.robloxIdentityId).toBe(identity.id);
  });
});
