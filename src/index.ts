// ============================================================================
// RUTA: src/index.ts
// ============================================================================

import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { Client, GatewayIntentBits } from 'discord.js';

import { disconnectDatabase, ensureDatabaseConnection, prisma } from '@/infrastructure/db/prisma';
import { commandRegistry } from '@/presentation/commands';
import { type AnyEventDescriptor, events } from '@/presentation/events';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';
import { versionInfo } from '@/shared/version';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const registerEvent = (descriptor: AnyEventDescriptor): void => {
  const handler = async (...args: unknown[]) => {
    try {
      await (descriptor.execute as (...parameters: unknown[]) => unknown)(...args);
    } catch (error) {
      const referenceId = randomUUID();
      logger.error({ event: descriptor.name, referenceId, err: error }, 'Error ejecutando evento.');
    }
  };

  if (descriptor.once) {
    client.once(descriptor.name, handler as (...listenerArgs: unknown[]) => void);
    return;
  }

  client.on(descriptor.name, handler as (...listenerArgs: unknown[]) => void);
};

const bootstrap = async (): Promise<void> => {
  logger.info({
    env: env.NODE_ENV,
    version: versionInfo.version,
    startedAt: versionInfo.startedAtIso,
  }, 'Iniciando Dedos Bot. Cada cambio corresponde a una nueva versión.');

  await ensureDatabaseConnection();

  for (const event of events) {
    registerEvent(event);
  }

  logger.info({ commandCount: commandRegistry.size }, 'Comandos cargados en memoria.');

  try {
    await client.login(env.DISCORD_TOKEN);
    logger.info('Cliente autenticado correctamente.');
  } catch (error) {
    logger.fatal({ err: error }, 'No fue posible iniciar sesión en Discord.');
    await disconnectDatabase();
    process.exit(1);
  }
};

const shutdown = async (signal: NodeJS.Signals) => {
  logger.warn({ signal }, 'Recibida señal de apagado, iniciando cierre controlado.');

  try {
    await client.destroy();
    await disconnectDatabase();
    logger.info('Recursos liberados correctamente.');
  } catch (error) {
    logger.error({ err: error }, 'Error durante el proceso de apagado.');
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', (signal) => {
  void shutdown(signal);
});

process.on('SIGTERM', (signal) => {
  void shutdown(signal);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesa rechazada sin manejar.');
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Excepción no controlada.');
});

void bootstrap().catch(async (error) => {
  logger.fatal({ err: error }, 'Fallo crítico durante el arranque.');
  await prisma.$disconnect();
  process.exit(1);
});
