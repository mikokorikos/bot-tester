import type {
  AnimatedRendererService,
  RenderOutcome,
} from '@domain/animated-renderer/index.js';
import { RenderJob } from '@domain/animated-renderer/index.js';

import { AppError } from '@/shared/errors/app-error.js';
import { createChildLogger } from '@/shared/logger/pino.js';

import type { RenderAnimationCommand } from '../commands/render-animation.command.js';
import {
  renderAnimationCommandSchema,
  type RenderAnimationPayload,
} from '../dto/render-animation.dto.js';

export class RenderAnimationHandler {
  private readonly logger = createChildLogger({ module: 'RenderAnimationHandler' });

  public constructor(private readonly renderer: AnimatedRendererService) {}

  public async execute(command: RenderAnimationCommand): Promise<RenderOutcome> {
    const payload = this.validate(command.payload);

    this.logger.info({ jobId: payload.id }, 'Starting animated render');

    try {
      const job = RenderJob.create({
        id: payload.id,
        source: payload.source,
        metadata: payload.metadata,
        options: payload.options,
        createdAt: new Date(),
      });

      const outcome = await this.renderer.render(job);

      this.logger.info(
        {
          jobId: payload.id,
          durationMs: outcome.metrics.totalTimeMs,
          outputSizeBytes: outcome.metrics.outputSizeBytes,
          cached: outcome.fromCache,
        },
        'Animated render completed',
      );

      return outcome;
    } catch (error) {
      this.logger.error({ jobId: payload.id, error }, 'Animated render failed');
      throw AppError.fromUnknown(error, 'animated-renderer.failure');
    }
  }

  private validate(payload: RenderAnimationPayload): RenderAnimationPayload {
    const parsed = renderAnimationCommandSchema.safeParse(payload);

    if (!parsed.success) {
      const error = AppError.validation('animated-renderer.invalid-payload', {
        issues: parsed.error.issues,
      });
      this.logger.warn({ issues: parsed.error.issues }, 'Invalid render payload received');
      throw error;
    }

    return parsed.data;
  }
}
