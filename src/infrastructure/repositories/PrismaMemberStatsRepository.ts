// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaMemberStatsRepository.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import type { IMemberStatsRepository, TradeMetadata } from '@/domain/repositories/IMemberStatsRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';
import { ensureUsersExist } from '@/infrastructure/repositories/utils/ensureUsersExist';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type MemberTradeStatsModel = Prisma.MemberTradeStatsGetPayload<{
  include: { preferredRobloxIdentity: true };
}>;

const mapToDomain = (stats: MemberTradeStatsModel): MemberTradeStats =>
  new MemberTradeStats(
    stats.userId,
    stats.tradesCompleted,
    stats.lastTradeAt,
    stats.preferredRobloxIdentity?.robloxUsername ?? null,
    stats.preferredRobloxIdentity?.robloxUserId ?? null,
    stats.partnerTag ?? null,
    stats.updatedAt,
  );

export class PrismaMemberStatsRepository implements IMemberStatsRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): IMemberStatsRepository {
    if (!PrismaMemberStatsRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to member stats repository.');
    }

    return new PrismaMemberStatsRepository(context);
  }

  public async recordCompletedTrade(
    userId: bigint,
    completedAt: Date,
    metadata?: TradeMetadata,
  ): Promise<MemberTradeStats> {
    await ensureUsersExist(this.prisma, [userId]);

    const preferredIdentity = await this.resolvePreferredIdentity(userId, metadata);

    const stats = await this.prisma.memberTradeStats.upsert({
      where: { userId },
      create: {
        userId,
        tradesCompleted: 1,
        lastTradeAt: completedAt,
        partnerTag: metadata?.partnerTag ?? null,
        preferredRobloxIdentityId: preferredIdentity ?? undefined,
      },
      update: {
        tradesCompleted: { increment: 1 },
        lastTradeAt: completedAt,
        ...(metadata?.partnerTag !== undefined ? { partnerTag: metadata.partnerTag } : {}),
        ...(preferredIdentity !== undefined ? { preferredRobloxIdentityId: preferredIdentity } : {}),
      },
      include: { preferredRobloxIdentity: true },
    });

    return mapToDomain(stats);
  }

  public async getByUserId(userId: bigint): Promise<MemberTradeStats | null> {
    const stats = await this.prisma.memberTradeStats.findUnique({
      where: { userId },
      include: { preferredRobloxIdentity: true },
    });

    return stats ? mapToDomain(stats) : null;
  }

  public async topMembers(limit: number): Promise<readonly MemberTradeStats[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 10;

    const stats = await this.prisma.memberTradeStats.findMany({
      orderBy: [
        { tradesCompleted: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: safeLimit,
      include: { preferredRobloxIdentity: true },
    });

    return stats.map(mapToDomain);
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'memberTradeStats' in value;
  }

  private async resolvePreferredIdentity(userId: bigint, metadata?: TradeMetadata): Promise<number | undefined> {
    if (!metadata?.robloxUserId && !metadata?.robloxUsername) {
      return undefined;
    }

    const identity = await this.prisma.userRobloxIdentity.findFirst({
      where: {
        userId,
        ...(metadata.robloxUserId ? { robloxUserId: metadata.robloxUserId } : {}),
        ...(metadata.robloxUsername ? { robloxUsername: metadata.robloxUsername } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return identity?.id;
  }
}
