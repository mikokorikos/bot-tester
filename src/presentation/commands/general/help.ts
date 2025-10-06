// ============================================================================
// RUTA: src/presentation/commands/general/help.ts
// ============================================================================

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { getRegisteredCommands } from '@/presentation/commands/command-registry';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { env } from '@/shared/config/env';
import { clampEmbedField } from '@/shared/utils/discord.utils';

const buildFieldValue = (commands: ReadonlyArray<Command>): string =>
  commands
    .map((command) => {
      const base = `• **/${command.data.name}** — ${command.data.description}`;
      const examples = command.examples?.length
        ? `\n   Ejemplos: ${command.examples.map((example) => `\`${example}\``).join(', ')}`
        : '';
      return `${base}${examples}`;
    })
    .join('\n');

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos disponibles y su descripción.'),
  category: 'General',
  examples: ['/help', `${env.COMMAND_PREFIX}help`],
  cooldownKey: 'help',
  prefix: {
    name: 'help',
    async execute(message) {
      const embed = createHelpEmbed();

      await message.reply({
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    },
  },
  async execute(interaction) {
    await interaction.reply({
      embeds: [createHelpEmbed()],
      flags: MessageFlags.Ephemeral,
    });
  },
};

function createHelpEmbed() {
  const grouped = new Map<string, Command[]>();

  for (const command of getRegisteredCommands()) {
    const category = command.category ?? 'General';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(command);
  }

  const fields = [...grouped.entries()]
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .map(([category, commands]) => ({
      name: category,
      value: clampEmbedField(buildFieldValue(commands)),
    }));

  return embedFactory.info({
    title: '📚 Lista de comandos disponibles',
    description:
      `Todos los comandos aceptan autocompletado donde aplica. También puedes usar el prefijo \`${env.COMMAND_PREFIX}\` para ejecutar versiones de texto.`,
    fields,
  });
}
