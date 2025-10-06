// ============================================================================
// RUTA: scripts/clear-commands.ts
// ============================================================================

import 'dotenv/config';

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { REST, Routes } from 'discord.js';

import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

const confirm = async (): Promise<boolean> => {
  if (!stdin.isTTY || !stdout.isTTY) {
    const envFlag = process.env.CLEAR_COMMANDS_CONFIRM?.toLowerCase();
    const confirmed = envFlag === 'yes' || envFlag === 'true';
    if (!confirmed) {
      logger.error('Acción cancelada: exporta CLEAR_COMMANDS_CONFIRM=yes para forzar en entornos no interactivos.');
    }
    return confirmed;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    '¿Seguro que deseas borrar todos los comandos registrados? Esta acción es irreversible (yes/no): ',
  );
  rl.close();

  return ['y', 'yes'].includes(answer.trim().toLowerCase());
};

const clearCommands = async (): Promise<void> => {
  if (!(await confirm())) {
    logger.info('Operación cancelada por el usuario.');
    return;
  }

  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  try {
    await rest.put(route, { body: [] });
    logger.warn({ scope: env.DISCORD_GUILD_ID ? 'guild' : 'global' }, 'Se limpiaron todos los comandos registrados.');
  } catch (error) {
    logger.error({ err: error }, 'Error limpiando comandos.');
    process.exitCode = 1;
  }
};

void clearCommands().finally(() => {
  logger.info('Proceso de limpieza finalizado.');
});
