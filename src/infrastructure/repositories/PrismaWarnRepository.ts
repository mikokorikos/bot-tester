// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaWarnRepository.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import { Warn, warnSeverityWeight } from '@/domain/entities/Warn';
import type {
  CreateWarnData,
  IWarnRepository,
  WarnSummary,
} from '@/domain/repositories/IWarnRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type PrismaWarnModel = Prisma.WarnGetPayload<Record<string, never>>;

const mapToDomain = (warn: PrismaWarnModel): Warn =>
  new Warn(
    warn.id,
    warn.userId,
    warn.moderatorId ?? null,
    warn.severity as Warn['severity'],
    warn.reason ?? null,
    warn.createdAt,
  );

export class PrismaWarnRepository implements IWarnRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): IWarnRepository {
    if (!PrismaWarnRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to warn repository.');
    }

    return new PrismaWarnRepository(context);
  }

  public async create(data: CreateWarnData): Promise<Warn> {
    const warn = await this.prisma.warn.create({
      data: {
        userId: data.userId,
        moderatorId: data.moderatorId ?? null,
        severity: data.severity,
        reason: data.reason ?? null,
      },
    });

    return mapToDomain(warn);
  }

  public async remove(id: number): Promise<void> {
    await this.prisma.warn.delete({ where: { id } });
  }

  public async listByUser(userId: bigint): Promise<readonly Warn[]> {
    const warns = await this.prisma.warn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return warns.map(mapToDomain);
  }

  public async getSummary(userId: bigint): Promise<WarnSummary> {
    const [aggregation, lastWarn] = await Promise.all([
      this.prisma.warn.aggregate({
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.warn.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const warns = await this.prisma.warn.findMany({ where: { userId } });
    const weightedScore = warns.reduce((total, warn) => total + warnSeverityWeight(warn.severity as Warn['severity']), 0);

    return {
      total: aggregation._count._all,
      weightedScore,
      lastWarnAt: lastWarn?.createdAt ?? null,
    };
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'warn' in value;
  }
}
