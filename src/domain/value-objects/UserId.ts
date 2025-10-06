// ============================================================================
// RUTA: src/domain/value-objects/UserId.ts
// ============================================================================

import { InvalidSnowflakeError } from '@/shared/errors/domain.errors';
import { isValidSnowflake } from '@/shared/utils/discord.utils';

/**
 * Value object que garantiza la validez de los identificadores de usuario de Discord.
 */
export class UserId {
  private constructor(private readonly value: bigint) {}

  public static fromString(id: string): UserId {
    if (!isValidSnowflake(id)) {
      throw new InvalidSnowflakeError(id);
    }

    return new UserId(BigInt(id));
  }

  public static fromBigInt(id: bigint): UserId {
    if (id <= 0n) {
      throw new InvalidSnowflakeError(id.toString());
    }

    return new UserId(id);
  }

  public toBigInt(): bigint {
    return this.value;
  }

  public toString(): string {
    return this.value.toString();
  }

  public equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
