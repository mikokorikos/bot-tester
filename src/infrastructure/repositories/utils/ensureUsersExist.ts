// ============================================================================
// RUTA: src/infrastructure/repositories/utils/ensureUsersExist.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';

import type { DiscordUserSnapshot } from '@/shared/types/discord';

const isBigInt = (value: unknown): value is bigint => typeof value === 'bigint';

const normalizeDate = (value?: Date | null): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  return new Date();
};

interface UserSnapshotData {
  readonly userId: bigint;
  readonly username?: string | null;
  readonly discriminator?: string | null;
  readonly globalName?: string | null;
  readonly avatarHash?: string | null;
  readonly bot?: boolean;
  readonly seenAt: Date;
}

interface MembershipSnapshotData {
  readonly guildId: bigint;
  readonly userId: bigint;
  readonly nickname?: string | null;
  readonly joinedAt?: Date | null;
  readonly roles?: readonly string[];
  readonly seenAt: Date;
}

interface SnapshotParts {
  readonly user: UserSnapshotData;
  readonly membership?: MembershipSnapshotData;
}

type SnapshotInput = bigint | DiscordUserSnapshot;

const toSnapshotParts = (input: SnapshotInput): SnapshotParts => {
  if (isBigInt(input)) {
    const seenAt = new Date();
    return {
      user: {
        userId: input,
        seenAt,
      },
    };
  }

  const seenAt = normalizeDate(input.seenAt);
  const user: UserSnapshotData = {
    userId: input.id,
    username: input.username ?? undefined,
    discriminator: input.discriminator ?? undefined,
    globalName: input.globalName ?? undefined,
    avatarHash: input.avatarHash ?? undefined,
    bot: input.bot ?? undefined,
    seenAt,
  };

  if (!input.guildId) {
    return { user };
  }

  const membership: MembershipSnapshotData = {
    guildId: input.guildId,
    userId: input.id,
    nickname: input.nickname ?? undefined,
    joinedAt: input.joinedAt ?? undefined,
    roles: input.roles ?? undefined,
    seenAt,
  };

  return { user, membership };
};

const mergeUserSnapshots = (current: UserSnapshotData, incoming: UserSnapshotData): UserSnapshotData => ({
  userId: current.userId,
  username: incoming.username !== undefined ? incoming.username : current.username,
  discriminator: incoming.discriminator !== undefined ? incoming.discriminator : current.discriminator,
  globalName: incoming.globalName !== undefined ? incoming.globalName : current.globalName,
  avatarHash: incoming.avatarHash !== undefined ? incoming.avatarHash : current.avatarHash,
  bot: incoming.bot !== undefined ? incoming.bot : current.bot,
  seenAt: incoming.seenAt > current.seenAt ? incoming.seenAt : current.seenAt,
});

const mergeMembershipSnapshots = (
  current: MembershipSnapshotData,
  incoming: MembershipSnapshotData,
): MembershipSnapshotData => ({
  guildId: current.guildId,
  userId: current.userId,
  nickname: incoming.nickname !== undefined ? incoming.nickname : current.nickname,
  joinedAt: incoming.joinedAt !== undefined ? incoming.joinedAt : current.joinedAt,
  roles: incoming.roles !== undefined ? incoming.roles : current.roles,
  seenAt: incoming.seenAt > current.seenAt ? incoming.seenAt : current.seenAt,
});

const withNullable = <T>(value: T | null | undefined): T | null | undefined =>
  value === undefined ? undefined : value;

const withBoolean = (value: boolean | undefined): boolean | undefined =>
  value === undefined ? undefined : value;

const buildMembershipKey = (snapshot: MembershipSnapshotData): string =>
  `${snapshot.guildId.toString()}:${snapshot.userId.toString()}`;

export const ensureUsersExist = async (
  prisma: PrismaClient | Prisma.TransactionClient,
  rawInputs: readonly (SnapshotInput | undefined | null)[],
): Promise<void> => {
  // FIX: Prisma typings expose model delegates on both PrismaClient and TransactionClient,
  // but the union type does not allow direct property access. Narrow explicitly to reuse delegates.
  const client = prisma as Prisma.TransactionClient;

  const inputs = rawInputs.filter((value): value is SnapshotInput => value !== null && value !== undefined);

  if (inputs.length === 0) {
    return;
  }

  const userSnapshots = new Map<bigint, UserSnapshotData>();
  const membershipSnapshots = new Map<string, MembershipSnapshotData>();

  for (const input of inputs) {
    const parts = toSnapshotParts(input);
    const existingUser = userSnapshots.get(parts.user.userId);

    userSnapshots.set(parts.user.userId, existingUser ? mergeUserSnapshots(existingUser, parts.user) : parts.user);

    if (parts.membership) {
      const key = buildMembershipKey(parts.membership);
      const existingMembership = membershipSnapshots.get(key);
      membershipSnapshots.set(
        key,
        existingMembership ? mergeMembershipSnapshots(existingMembership, parts.membership) : parts.membership,
      );
    }
  }

  const userUpserts = Array.from(userSnapshots.values(), async (snapshot) => {
    await client.user.upsert({
      where: { id: snapshot.userId },
      create: {
        id: snapshot.userId,
        username: snapshot.username ?? null,
        discriminator: snapshot.discriminator ?? null,
        globalName: snapshot.globalName ?? null,
        avatarHash: snapshot.avatarHash ?? null,
        bot: snapshot.bot ?? false,
        firstSeenAt: snapshot.seenAt,
        lastSeenAt: snapshot.seenAt,
      },
      update: {
        username: withNullable(snapshot.username),
        discriminator: withNullable(snapshot.discriminator),
        globalName: withNullable(snapshot.globalName),
        avatarHash: withNullable(snapshot.avatarHash),
        bot: withBoolean(snapshot.bot),
        lastSeenAt: snapshot.seenAt,
      },
    });
  });

  await Promise.all(userUpserts);

  if (membershipSnapshots.size === 0) {
    return;
  }

  const membershipUpserts = Array.from(membershipSnapshots.values(), async (snapshot) => {
    await client.guildMember.upsert({
      where: { guildId_userId: { guildId: snapshot.guildId, userId: snapshot.userId } },
      create: {
        guildId: snapshot.guildId,
        userId: snapshot.userId,
        nickname: snapshot.nickname ?? null,
        joinedAt: snapshot.joinedAt ?? null,
        lastSeenAt: snapshot.seenAt,
        roles: snapshot.roles ? [...snapshot.roles] : undefined,
      },
      update: {
        nickname: withNullable(snapshot.nickname),
        joinedAt: withNullable(snapshot.joinedAt),
        lastSeenAt: snapshot.seenAt,
        roles: snapshot.roles ? [...snapshot.roles] : undefined,
      },
    });
  });

  await Promise.all(membershipUpserts);
};
