// ============================================================================
// RUTA: src/shared/errors/base.error.ts
// ============================================================================

import { stripDiacritics, stripDiacriticsDeep } from '@/shared/utils/text';

export interface DedosErrorOptions {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly exposeMessage?: boolean;
}

export class DedosError extends Error {
  public readonly code: string;

  public readonly metadata: Record<string, unknown>;

  public readonly exposeMessage: boolean;

  public constructor(options: DedosErrorOptions) {
    const sanitizedMessage = stripDiacritics(options.message);
    const sanitizedMetadata = options.metadata ? stripDiacriticsDeep(options.metadata) : undefined;

    super(sanitizedMessage);
    this.name = 'DedosError';
    this.code = options.code;
    this.metadata = sanitizedMetadata ?? {};
    this.exposeMessage = options.exposeMessage ?? false;

    if (options.cause) {
      this.cause = stripDiacriticsDeep(options.cause);
    }

    Error.captureStackTrace?.(this, DedosError);
  }
}

export const isDedosError = (value: unknown): value is DedosError => value instanceof DedosError;
