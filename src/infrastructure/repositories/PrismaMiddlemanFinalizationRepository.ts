// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaMiddlemanFinalizationRepository.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';

export class PrismaMiddlemanFinalizationRepository
  implements IMiddlemanFinalizationRepository {
  public constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  public withTransaction(context: TransactionContext): IMiddlemanFinalizationRepository {
    if (!PrismaMiddlemanFinalizationRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to middleman finalizations repository.');
    }

    return new PrismaMiddlemanFinalizationRepository(context);
  }

  public async listByTicket(ticketId: number): Promise<readonly bigint[]> {
    const rows = await this.prisma.middlemanTradeFinalization.findMany({
      where: { ticketId },
      select: { userId: true },
    });

    return rows.map((row) => row.userId);
  }

  public async confirm(ticketId: number, userId: bigint): Promise<void> {
    await this.prisma.middlemanTradeFinalization.upsert({
      where: { ticketId_userId: { ticketId, userId } },
      update: { confirmedAt: new Date() },
      create: { ticketId, userId },
    });
  }

  public async revoke(ticketId: number, userId: bigint): Promise<void> {
    await this.prisma.middlemanTradeFinalization.deleteMany({
      where: { ticketId, userId },
    });
  }

  public async reset(ticketId: number): Promise<void> {
    await this.prisma.middlemanTradeFinalization.deleteMany({ where: { ticketId } });
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'middlemanTradeFinalization' in value;
  }
}
