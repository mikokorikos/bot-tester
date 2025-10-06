// ============================================================================
// RUTA: src/presentation/commands/admin/config.ts
// ============================================================================

import { GuildMember, SlashCommandBuilder } from 'discord.js';

import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { PERMISSIONS } from '@/shared/config/constants';
import { loadRuntimeConfig, updateRuntimeConfig } from '@/shared/config/runtime';
import { hasPermissions } from '@/shared/utils/permissions';

const CONFIG_KEYS = ['reviewsChannelId'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

export const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Gestiona la configuración runtime del bot')
    .addSubcommand((sub) =>
      sub
        .setName('get')
        .setDescription('Obtiene el valor de una clave de configuración')
        .addStringOption((option) =>
          option
            .setName('clave')
            .setDescription('Clave de configuración (ej. reviewsChannelId)')
            .addChoices(CONFIG_KEYS.map((key) => ({ name: key, value: key })))
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Actualiza una clave de configuración')
        .addStringOption((option) =>
          option
            .setName('clave')
            .setDescription('Clave de configuración (ej. reviewsChannelId)')
            .addChoices(CONFIG_KEYS.map((key) => ({ name: key, value: key })))
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('valor')
            .setDescription('Nuevo valor (usa "null" para limpiar)')
            .setRequired(true),
        ),
    ),
  category: 'Administración',
  examples: ['/config get clave:reviewsChannelId', '/config set clave:reviewsChannelId valor:123456789012345678'],
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Acción no disponible', description: 'Solo usable en servidores.' })],
        ephemeral: true,
      });
      return;
    }

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasPermissions(member, PERMISSIONS.admin)) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Permisos insuficientes', description: 'Necesitas permisos de administrador.' })],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const key = interaction.options.getString('clave', true) as ConfigKey;

    if (subcommand === 'get') {
      const config = await loadRuntimeConfig();

      await interaction.reply({
        embeds: [
          embedFactory.info({
            title: 'Configuración actual',
            fields: [
              { name: key, value: String(config[key] ?? 'null') },
            ],
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'set') {
      const rawValue = interaction.options.getString('valor', true);
      const value = rawValue.toLowerCase() === 'null' ? null : rawValue;

      const updated = await updateRuntimeConfig({ [key]: value } as Record<ConfigKey, string | null>);

      await interaction.reply({
        embeds: [
          embedFactory.success({
            title: 'Configuración actualizada',
            description: `La clave **${key}** ahora vale **${updated[key] ?? 'null'}**.`,
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
