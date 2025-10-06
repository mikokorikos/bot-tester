// ============================================================================
// RUTA: src/application/usecases/warns/AddWarnUseCase.ts
// ============================================================================

import type { Logger } from 'pino';

import { type AddWarnDTO, AddWarnSchema } from '@/application/dto/warn.dto';
import type { Warn } from '@/domain/entities/Warn';
import type { IWarnRepository, WarnSummary } from '@/domain/repositories/IWarnRepository';

export type EscalationAction = 'NONE' | 'MUTE' | 'TEMP_BAN' | 'BAN';

export interface AddWarnResult {
  readonly warn: Warn;
  readonly summary: WarnSummary;
  readonly recommendedAction: EscalationAction;
}

export class AddWarnUseCase {
  public constructor(private readonly warnRepository: IWarnRepository, private readonly logger: Logger) {}

  public async execute(payload: AddWarnDTO): Promise<AddWarnResult> {
    const data = AddWarnSchema.parse(payload);

    const warn = await this.warnRepository.create({
      userId: BigInt(data.userId),
      moderatorId: BigInt(data.moderatorId),
      severity: data.severity,
      reason: data.reason ?? null,
    });

    const summary = await this.warnRepository.getSummary(BigInt(data.userId));
    const recommendedAction = this.resolveAction(summary);

    this.logger.info(
      { warnId: warn.id, userId: data.userId, moderatorId: data.moderatorId, severity: data.severity },
      'Warn aplicado correctamente.',
    );

    return { warn, summary, recommendedAction };
  }

  private resolveAction(summary: WarnSummary): EscalationAction {
    if (summary.weightedScore >= 8) {
      return 'BAN';
    }

    if (summary.weightedScore >= 6) {
      return 'TEMP_BAN';
    }

    if (summary.weightedScore >= 4) {
      return 'MUTE';
    }

    return 'NONE';
  }
}
