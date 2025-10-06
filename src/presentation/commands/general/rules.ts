// ============================================================================
// RUTA: src/presentation/commands/general/rules.ts
// ============================================================================

import { ChannelType, SlashCommandBuilder } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { env } from '@/shared/config/env';
import { brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const RULES = [
  'Respeta a todos los miembros y evita lenguaje ofensivo.',
  'Esta prohibido estafar, impersonar o compartir informacion privada.',
  'Los trades deben gestionarse en los canales correspondientes y con middleman oficial cuando se solicite.',
  'No hagas spam ni promociones sin autorizacion del staff.',
  'Sigue las indicaciones del equipo de moderacion y abre un ticket si necesitas ayuda.',
];

const buildRulesEmbed = () =>
  embedFactory.info({
    title: '📜 Reglas principales de Dedos Shop',
    description: RULES.map((rule, index) => `${index + 1}. ${rule}`).join('\n'),
    footer: 'El incumplimiento puede resultar en sanciones dentro del servidor.',
  });

export const rulesCommand: Command = {
  data: new SlashCommandBuilder().setName('rules').setDescription('Publica el panel con las reglas principales del servidor.'),
  category: 'General',
  examples: ['/rules', `${env.COMMAND_PREFIX}rules`],
  prefix: {
    name: 'rules',
    async execute(message) {
      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Canal no compatible',
                description: 'Las reglas solo pueden publicarse en canales de texto del servidor.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      await message.channel.send(
        brandMessageOptions({
          embeds: [buildRulesEmbed()],
          allowedMentions: { parse: [] },
        }),
      );
    },
  },
  async execute(interaction) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [buildRulesEmbed()],
        allowedMentions: { parse: [] },
      }),
    );
  },
};
