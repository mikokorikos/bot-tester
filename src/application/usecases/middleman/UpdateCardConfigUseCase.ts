import type { Logger } from 'pino';

import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import { DEFAULT_MIDDLEMAN_CARD_CONFIG, parseMiddlemanCardConfig } from '@/domain/value-objects/MiddlemanCardConfig';
import { UnauthorizedActionError } from '@/shared/errors/domain.errors';

interface UpdateCardConfigInput {
  userId: string;
  config?: unknown;
  reset?: boolean;
}

export class UpdateCardConfigUseCase {
  public constructor(
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly logger: Logger,
  ) {}

  public async execute(payload: UpdateCardConfigInput): Promise<void> {
    const userId = BigInt(payload.userId);
    const isMiddleman = await this.middlemanRepo.isMiddleman(userId);

    if (!isMiddleman) {
      throw new UnauthorizedActionError('middleman:card:config');
    }

    if (payload.reset) {
      await this.middlemanRepo.updateProfile({ userId, cardConfig: null });
      this.logger.info({ userId: payload.userId }, 'Middleman card config reset to defaults.');
      return;
    }

    const parsedConfig = parseMiddlemanCardConfig(payload.config ?? DEFAULT_MIDDLEMAN_CARD_CONFIG);

    await this.middlemanRepo.updateProfile({ userId, cardConfig: parsedConfig });
    this.logger.info({ userId: payload.userId }, 'Middleman card config updated.');
  }
}
