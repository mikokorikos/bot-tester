// ============================================================================
// RUTA: scripts/deploy-commands.ts
// ============================================================================

import 'dotenv/config';

import { REST, Routes } from 'discord.js';

import { serializeCommands } from '@/presentation/commands';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

const registerCommands = async (): Promise<void> => {
  const body = serializeCommands();

  try {
    if (env.DISCORD_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
        body,
      });
      logger.info({ count: body.length, scope: 'guild', guildId: env.DISCORD_GUILD_ID }, 'Comandos registrados para la guild.');
    } else {
      await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
      logger.info({ count: body.length, scope: 'global' }, 'Comandos registrados globalmente.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error registrando comandos.');
    process.exitCode = 1;
  }
};

void registerCommands().finally(() => {
  logger.info('Proceso de registro finalizado.');
});
