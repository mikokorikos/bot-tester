// ============================================================================
// RUTA: src/presentation/events/messageCreate.ts
// ============================================================================

import { Events, type Message } from 'discord.js';

import { prefixCommandRegistry } from '@/presentation/commands';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { EventDescriptor } from '@/presentation/events/types';
import { env } from '@/shared/config/env';
import { recordDebugEvent, runWithDebugSession } from '@/shared/debug/verbose-debugger';
import { logger } from '@/shared/logger/pino';

export const messageCreateEvent: EventDescriptor<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message): Promise<void> {
    if (!message.inGuild()) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    const prefix = env.COMMAND_PREFIX;

    if (!message.content.startsWith(prefix)) {
      return;
    }

    const content = message.content.slice(prefix.length).trim();

    if (content.length === 0) {
      return;
    }

    const [rawName, ...args] = content.split(/\s+/u);

    if (!rawName) {
      return;
    }

    const commandName = rawName.toLowerCase();
    const command = prefixCommandRegistry.get(commandName);

    if (!command) {
      logger.debug({ commandName }, 'Comando con prefijo no encontrado.');
      await message.reply({
        embeds: [
          embedFactory.warning({
            title: 'Comando no disponible',
            description: `No existe un comando llamado \`${commandName}\`. Usa /help o \`${prefix}help\` para ver la lista completa.`,
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      logger.debug({ commandName, userId: message.author.id }, 'Ejecutando comando con prefijo.');

      await runWithDebugSession(
        {
          trigger: `${prefix}${command.name}`,
          actorTag: message.author.tag,
          channel: message.channel,
        },
        async () => {
          if (args.length > 0) {
            recordDebugEvent('prefix.args', args);
          }

          await command.execute(message, args);
        },
      );
    } catch (error) {
      logger.error({ err: error, commandName, userId: message.author.id }, 'Error al ejecutar comando con prefijo.');

      await message.reply({
        embeds: [
          embedFactory.error({
            title: 'No se pudo ejecutar el comando',
            description: 'Ocurrió un error inesperado. Inténtalo nuevamente en unos segundos.',
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
