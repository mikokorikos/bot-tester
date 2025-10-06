// ============================================================================
// RUTA: src/shared/utils/result.ts
// ============================================================================

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  public readonly ok = true as const;
  public readonly err = false as const;

  public constructor(private readonly value: T) {}

  public isOk(): this is Ok<T, E> {
    return true;
  }

  public isErr(): this is Err<T, E> {
    return false;
  }

  public unwrap(): T {
    return this.value;
  }

  public unwrapOr(defaultValue: T): T {
    return this.value ?? defaultValue;
  }

  public map<U>(mapper: (value: T) => U): Result<U, E> {
    return ok(mapper(this.value));
  }

  public mapErr<F>(_mapper: (error: E) => F): Result<T, F> {
    return ok(this.value);
  }
}

export class Err<T, E> {
  public readonly ok = false as const;
  public readonly err = true as const;

  public constructor(private readonly error: E) {}

  public isOk(): this is Ok<T, E> {
    return false;
  }

  public isErr(): this is Err<T, E> {
    return true;
  }

  public unwrap(): T {
    throw this.error;
  }

  public unwrapErr(): E {
    return this.error;
  }

  public map<U>(_mapper: (value: T) => U): Result<U, E> {
    return err(this.error);
  }

  public mapErr<F>(mapper: (error: E) => F): Result<T, F> {
    return err(mapper(this.error));
  }
}

export const ok = <T, E>(value: T): Result<T, E> => new Ok<T, E>(value);

export const err = <T, E>(error: E): Result<T, E> => new Err<T, E>(error);
