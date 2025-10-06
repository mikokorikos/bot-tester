/* eslint-disable no-console */
// =============================================================================
// RUTA: prisma/seed.ts
// =============================================================================

import { PrismaClient, TicketStatus, TicketType, WarnSeverity } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Iniciando carga de datos de prueba...');

  const ownerId = BigInt('111111111111111111');
  const partnerId = BigInt('222222222222222222');
  const middlemanId = BigInt('333333333333333333');
  const guildId = BigInt('444444444444444444');

  const owner = await prisma.user.upsert({
    where: { id: ownerId },
    update: {
      username: 'owner',
      discriminator: '0001',
      globalName: 'Owner',
      lastSeenAt: new Date(),
    },
    create: {
      id: ownerId,
      username: 'owner',
      discriminator: '0001',
      globalName: 'Owner',
    },
  });

  const partner = await prisma.user.upsert({
    where: { id: partnerId },
    update: {
      username: 'partner',
      discriminator: '0002',
      globalName: 'Partner',
      lastSeenAt: new Date(),
    },
    create: {
      id: partnerId,
      username: 'partner',
      discriminator: '0002',
      globalName: 'Partner',
    },
  });

  const middlemanUser = await prisma.user.upsert({
    where: { id: middlemanId },
    update: {
      username: 'middleman',
      discriminator: '0003',
      globalName: 'Middleman',
      lastSeenAt: new Date(),
    },
    create: {
      id: middlemanId,
      username: 'middleman',
      discriminator: '0003',
      globalName: 'Middleman',
    },
  });

  await prisma.guildMember.upsert({
    where: { guildId_userId: { guildId, userId: ownerId } },
    update: { nickname: 'Owner', lastSeenAt: new Date(), roles: ['OWNER', 'TRADER'] },
    create: {
      guildId,
      userId: ownerId,
      nickname: 'Owner',
      joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      roles: ['OWNER', 'TRADER'],
    },
  });

  await prisma.guildMember.upsert({
    where: { guildId_userId: { guildId, userId: partnerId } },
    update: { nickname: 'Partner', lastSeenAt: new Date(), roles: ['PARTNER'] },
    create: {
      guildId,
      userId: partnerId,
      nickname: 'Partner',
      joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15),
      roles: ['PARTNER'],
    },
  });

  await prisma.guildMember.upsert({
    where: { guildId_userId: { guildId, userId: middlemanId } },
    update: { nickname: 'Dedos Middleman', lastSeenAt: new Date(), roles: ['MIDDLEMAN'] },
    create: {
      guildId,
      userId: middlemanId,
      nickname: 'Dedos Middleman',
      joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120),
      roles: ['MIDDLEMAN'],
    },
  });

  const middlemanIdentity = await prisma.userRobloxIdentity.upsert({
    where: { userId_robloxUsername: { userId: middlemanId, robloxUsername: 'DedosMiddleman' } },
    update: {
      robloxUserId: BigInt('900100202'),
      verified: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId: middlemanId,
      robloxUsername: 'DedosMiddleman',
      robloxUserId: BigInt('900100202'),
      verified: true,
      lastUsedAt: new Date(),
    },
  });

  await prisma.middleman.upsert({
    where: { userId: middlemanId },
    update: { primaryRobloxIdentityId: middlemanIdentity.id },
    create: {
      userId: middlemanId,
      primaryRobloxIdentityId: middlemanIdentity.id,
    },
  });

  const ticket = await prisma.ticket.create({
    data: {
      guildId,
      channelId: BigInt('555555555555555555'),
      ownerId: owner.id,
      type: TicketType.MM,
      status: TicketStatus.CLAIMED,
      participants: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: partner.id, role: 'PARTNER' },
        ],
      },
      middlemanClaim: {
        create: {
          middlemanId: middlemanUser.id,
        },
      },
    },
  });

  await prisma.warn.createMany({
    data: [
      {
        userId: partner.id,
        moderatorId: owner.id,
        severity: WarnSeverity.MINOR,
        reason: 'Spam en el servidor de soporte.',
      },
      {
        userId: partner.id,
        moderatorId: middlemanUser.id,
        severity: WarnSeverity.MAJOR,
        reason: 'Incumplimiento de reglas de middleman.',
      },
    ],
  });

  await prisma.memberTradeStats.upsert({
    where: { userId: middlemanId },
    update: {
      tradesCompleted: { increment: 5 },
      lastTradeAt: new Date(),
      partnerTag: 'Trusted Partner',
      preferredRobloxIdentityId: middlemanIdentity.id,
    },
    create: {
      userId: middlemanId,
      tradesCompleted: 5,
      lastTradeAt: new Date(),
      preferredRobloxIdentityId: middlemanIdentity.id,
      partnerTag: 'Trusted Partner',
    },
  });

  console.log('✅ Datos sembrados correctamente.');
  console.table({ owner: owner.id.toString(), partner: partner.id.toString(), middleman: middlemanUser.id.toString(), ticket: ticket.id });
}

main()
  .catch((error) => {
    console.error('❌ Error ejecutando seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
