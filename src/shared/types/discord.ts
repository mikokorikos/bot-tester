// ============================================================================
// RUTA: src/shared/types/discord.ts
// ============================================================================

export interface DiscordUserSnapshot {
  readonly id: bigint;
  readonly username?: string | null;
  readonly discriminator?: string | null;
  readonly globalName?: string | null;
  readonly avatarHash?: string | null;
  readonly bot?: boolean;
  readonly seenAt?: Date;
  readonly guildId?: bigint;
  readonly nickname?: string | null;
  readonly joinedAt?: Date | null;
  readonly roles?: readonly string[];
}
