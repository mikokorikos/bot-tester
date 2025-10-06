// ============================================================================
// RUTA: src/presentation/commands/warns/warn.ts
// ============================================================================

import { GuildMember, SlashCommandBuilder } from 'discord.js';

import { AddWarnUseCase } from '@/application/usecases/warns/AddWarnUseCase';
import { ListWarnsUseCase } from '@/application/usecases/warns/ListWarnsUseCase';
import { RemoveWarnUseCase } from '@/application/usecases/warns/RemoveWarnUseCase';
import { WarnSeverity } from '@/domain/entities/Warn';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaWarnRepository } from '@/infrastructure/repositories/PrismaWarnRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COOLDOWNS, PERMISSIONS } from '@/shared/config/constants';
import { logger } from '@/shared/logger/pino';
import { cooldownManager } from '@/shared/utils/cooldown-manager';
import { mentionUser } from '@/shared/utils/discord.utils';
import { dmQueue } from '@/shared/utils/dm-queue';
import { hasPermissions } from '@/shared/utils/permissions';

const warnRepository = new PrismaWarnRepository(prisma);
const addWarnUseCase = new AddWarnUseCase(warnRepository, logger);
const removeWarnUseCase = new RemoveWarnUseCase(warnRepository, logger);
const listWarnsUseCase = new ListWarnsUseCase(warnRepository);

export const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Gestiona advertencias de miembros')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Aplica una advertencia a un miembro')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro a advertir').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('severidad')
            .setDescription('Nivel de severidad de la advertencia')
            .addChoices(
              { name: 'Leve', value: WarnSeverity.MINOR },
              { name: 'Grave', value: WarnSeverity.MAJOR },
              { name: 'Crítica', value: WarnSeverity.CRITICAL },
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('razon')
            .setDescription('Motivo de la advertencia')
            .setMaxLength(400)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Elimina una advertencia existente por ID')
        .addIntegerOption((option) =>
          option.setName('warn_id').setDescription('ID de la advertencia a eliminar').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Lista las advertencias de un miembro')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro a consultar').setRequired(true),
        ),
    ),
  category: 'Moderación',
  examples: ['/warn add usuario:@Miembro severidad:Leve', '/warn list usuario:@Miembro'],
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Acción no disponible', description: 'Solo disponible en servidores.' })],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!hasPermissions(member, PERMISSIONS.staff)) {
      await interaction.reply({
        embeds: [embedFactory.error({ title: 'Permisos insuficientes', description: 'Necesitas permisos de staff para usar este comando.' })],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'add') {
      const target = interaction.options.getUser('usuario', true);
      const severity = interaction.options.getString('severidad', true) as WarnSeverity;
      const reason = interaction.options.getString('razon') ?? undefined;

      if (target.bot) {
        await interaction.reply({
          embeds: [embedFactory.error({ title: 'No permitido', description: 'No puedes advertir a otros bots.' })],
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `warn:${interaction.user.id}`;
      if (!cooldownManager.consume(cooldownKey, interaction.user.id, COOLDOWNS.warnCommand)) {
        await interaction.reply({
          embeds: [
            embedFactory.warning({
              title: 'Espera un momento',
              description: 'Estás ejecutando este comando demasiado rápido. Inténtalo de nuevo en unos segundos.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const result = await addWarnUseCase.execute({
        userId: target.id,
        moderatorId: interaction.user.id,
        severity,
        reason,
      });

      await interaction.editReply({
        embeds: [
          embedFactory.warnApplied({
            userTag: mentionUser(target.id),
            moderatorTag: mentionUser(interaction.user.id),
            severity,
            reason,
          }),
          embedFactory.warnSummary({
            'Advertencias totales': result.summary.total,
            'Puntuación ponderada': result.summary.weightedScore,
            'Última advertencia': result.summary.lastWarnAt
              ? `<t:${Math.floor(result.summary.lastWarnAt.getTime() / 1000)}:R>`
              : 'N/A',
            'Acción recomendada': result.recommendedAction,
          }),
        ],
      });

      try {
        await dmQueue.enqueue(target, {
          embeds: [
            embedFactory.warnApplied({
              userTag: target.toString(),
              moderatorTag: mentionUser(interaction.user.id),
              severity,
              reason,
            }),
          ],
        });
      } catch (error) {
        logger.warn({ err: error, userId: target.id }, 'No se pudo enviar la advertencia por DM.');
      }

      return;
    }

    if (subcommand === 'remove') {
      const warnId = interaction.options.getInteger('warn_id', true);

      await interaction.deferReply({ ephemeral: true });
      await removeWarnUseCase.execute({ warnId });

      await interaction.editReply({
        embeds: [embedFactory.success({ title: 'Advertencia eliminada', description: `La advertencia #${warnId} fue eliminada.` })],
      });
      return;
    }

    if (subcommand === 'list') {
      const target = interaction.options.getUser('usuario', true);

      await interaction.deferReply({ ephemeral: true });

      const { warns, summary } = await listWarnsUseCase.execute({ userId: target.id });

      await interaction.editReply({
        embeds: [
          embedFactory.warnSummary({
            Miembro: mentionUser(target.id),
            'Advertencias registradas': warns.length,
            'Puntuación ponderada': summary.weightedScore,
            'Última advertencia': summary.lastWarnAt
              ? `<t:${Math.floor(summary.lastWarnAt.getTime() / 1000)}:R>`
              : 'N/A',
          }),
        ],
      });
      return;
    }
  },
};
