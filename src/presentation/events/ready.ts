// ============================================================================
// RUTA: src/presentation/events/ready.ts
// ============================================================================

import type { Client } from 'discord.js';
import { Events } from 'discord.js';

import { prisma } from '@/infrastructure/db/prisma';
import type { EventDescriptor } from '@/presentation/events/types';
import { DatabaseUnavailableError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';

export const readyEvent: EventDescriptor<typeof Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client<true>): Promise<void> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info({ tag: client.user.tag, guilds: client.guilds.cache.size }, 'Bot iniciado correctamente.');
    } catch (error) {
      logger.error({ err: error }, 'Error verificando el estado de la base de datos.');
      throw new DatabaseUnavailableError();
    }
  },
};
