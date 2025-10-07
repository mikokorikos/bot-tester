import { DedosError } from './base.error.js';

interface AppErrorOptions {
  readonly code: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly cause?: unknown;
  readonly exposeMessage?: boolean;
}

export class AppError extends DedosError {
  private constructor(options: AppErrorOptions) {
    super({
      code: options.code,
      message: options.message,
      metadata: options.metadata,
      cause: options.cause,
      exposeMessage: options.exposeMessage ?? false,
    });
  }

  public static fromUnknown(error: unknown, code = 'UNEXPECTED_ERROR'): AppError {
    if (error instanceof AppError) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error('Unknown error');
    return new AppError({ code, message: cause.message, cause, exposeMessage: false });
  }

  public static fromError(error: Error, code = 'UNEXPECTED_ERROR'): AppError {
    return new AppError({ code, message: error.message, cause: error, exposeMessage: false });
  }

  public static validation(code: string, metadata: Record<string, unknown>): AppError {
    return new AppError({
      code,
      message: 'Validation failed for the provided payload.',
      metadata,
      exposeMessage: true,
    });
  }

  public static unsupported(
    code: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): AppError {
    return new AppError({
      code,
      message,
      metadata,
      exposeMessage: false,
    });
  }
}
