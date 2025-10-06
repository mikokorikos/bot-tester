// =============================================================================
// RUTA: src/application/usecases/warn/AddWarnUseCase.ts
// =============================================================================

import type { Logger } from 'pino';
import { z, ZodError } from 'zod';

import { WarnSeverity, warnSeverityWeight } from '@/domain/entities/Warn';
import type { CreateWarnData, IWarnRepository } from '@/domain/repositories/IWarnRepository';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

const AddWarnSchema = z.object({
  userId: z.string().regex(/^\d+$/u, 'ID de usuario inválido'),
  moderatorId: z.string().regex(/^\d+$/u, 'ID de moderador inválido').optional(),
  severity: z.nativeEnum(WarnSeverity),
  reason: z.string().trim().min(1).max(500).optional(),
});

export type AddWarnDTO = z.infer<typeof AddWarnSchema>;

type RecommendedAction = 'NONE' | 'TIMEOUT_1H' | 'TIMEOUT_24H' | 'BAN';

export interface WarnSummary {
  readonly totalPoints: number;
  readonly recommendedAction: RecommendedAction;
}

export interface AddWarnResult {
  readonly warn: Awaited<ReturnType<IWarnRepository['create']>>;
  readonly summary: WarnSummary;
}

export class AddWarnUseCase {
  public constructor(private readonly repository: IWarnRepository, private readonly logger: Logger) {}

  public async execute(dto: AddWarnDTO): Promise<AddWarnResult> {
    let payload: AddWarnDTO;
    try {
      payload = AddWarnSchema.parse(dto);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationFailedError(error.flatten().fieldErrors);
      }

      throw error;
    }

    const creationData: CreateWarnData = {
      userId: BigInt(payload.userId),
      moderatorId: payload.moderatorId ? BigInt(payload.moderatorId) : null,
      severity: payload.severity,
      reason: payload.reason ?? null,
    };

    this.logger.debug({ userId: payload.userId, severity: payload.severity }, 'Creando advertencia para usuario.');
    const warn = await this.repository.create(creationData);

    const warns = await this.repository.listByUser(BigInt(payload.userId));
    const totalPoints = warns.reduce((acc, current) => acc + warnSeverityWeight(current.severity), 0);
    const recommendedAction = determineRecommendedAction(totalPoints);

    this.logger.info(
      { userId: payload.userId, warnId: warn.id, totalPoints, recommendedAction },
      'Advertencia registrada correctamente.',
    );

    return {
      warn,
      summary: {
        totalPoints,
        recommendedAction,
      },
    };
  }
}

const determineRecommendedAction = (totalPoints: number): RecommendedAction => {
  if (totalPoints >= 7) {
    return 'BAN';
  }

  if (totalPoints >= 5) {
    return 'TIMEOUT_24H';
  }

  if (totalPoints >= 3) {
    return 'TIMEOUT_1H';
  }

  return 'NONE';
};
