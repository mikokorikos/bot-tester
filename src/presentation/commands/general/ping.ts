// ============================================================================
// RUTA: src/presentation/commands/general/ping.ts
// ============================================================================

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COOLDOWNS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Verifica la latencia del bot y la conexión con Discord.'),
  category: 'General',
  examples: ['/ping', `${env.COMMAND_PREFIX}ping`],
  cooldownKey: 'ping',
  prefix: {
    name: 'ping',
    async execute(message) {
      const messageLatency = Date.now() - message.createdTimestamp;
      const websocketLatency = Math.round(message.client.ws.ping);

      logger.debug({ messageLatency, websocketLatency }, 'Ping ejecutado mediante prefijo');

      await message.reply({
        embeds: [
          embedFactory.success({
            title: '🏓 Pong!',
            description: `Latencia REST estimada: **${messageLatency} ms**\nLatencia WebSocket: **${websocketLatency} ms**`,
            footer: `Próxima actualización disponible en ${COOLDOWNS.ping / 1000}s`,
          }),
        ],
        allowedMentions: { repliedUser: false },
      });
    },
  },
  async execute(interaction) {
    const interactionLatency = Date.now() - interaction.createdTimestamp;
    const websocketLatency = Math.round(interaction.client.ws.ping);

    logger.debug({ interactionLatency, websocketLatency }, 'Ping ejecutado');

    await interaction.reply({
      embeds: [
        embedFactory.success({
          title: '🏓 Pong!',
          description: `Latencia REST: **${interactionLatency} ms**\nLatencia WebSocket: **${websocketLatency} ms**`,
          footer: `Próxima actualización disponible en ${COOLDOWNS.ping / 1000}s`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
