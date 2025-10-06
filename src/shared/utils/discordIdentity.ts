// ============================================================================
// RUTA: src/shared/utils/discordIdentity.ts
// ============================================================================

import type { GuildMember, User } from 'discord.js';

import type { DiscordUserSnapshot } from '@/shared/types/discord';

const normalizeRoles = (roles: readonly string[] | undefined): readonly string[] | undefined => {
  if (!roles || roles.length === 0) {
    return undefined;
  }

  return Array.from(new Set(roles));
};

export const snapshotFromUser = (user: User, seenAt: Date = new Date()): DiscordUserSnapshot => ({
  id: BigInt(user.id),
  username: user.username,
  discriminator: 'discriminator' in user ? user.discriminator : undefined,
  globalName: 'globalName' in user ? user.globalName : undefined,
  avatarHash: user.avatar ?? undefined,
  bot: user.bot,
  seenAt,
});

export const snapshotFromMember = (member: GuildMember, seenAt: Date = new Date()): DiscordUserSnapshot => ({
  ...snapshotFromUser(member.user, seenAt),
  guildId: BigInt(member.guild.id),
  nickname: member.nickname,
  joinedAt: member.joinedAt ?? undefined,
  roles: normalizeRoles(member.roles.cache.map((role) => role.id)),
});
