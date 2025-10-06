// ============================================================================
// RUTA: src/presentation/commands/stats/stats.ts
// ============================================================================

import { GuildMember, SlashCommandBuilder } from 'discord.js';

import { GetMemberStatsUseCase } from '@/application/usecases/stats/GetMemberStatsUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { memberCardGenerator } from '@/infrastructure/external/MemberCardGenerator';
import { PrismaMemberStatsRepository } from '@/infrastructure/repositories/PrismaMemberStatsRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandEditReplyOptions } from '@/shared/utils/branding';

const statsRepository = new PrismaMemberStatsRepository(prisma);
const getStatsUseCase = new GetMemberStatsUseCase(statsRepository);

export const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Consulta estadisticas de comercio de un miembro')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a consultar').setRequired(false),
    ),
  category: 'General',
  examples: ['/stats', '/stats usuario:@Miembro'],
  async execute(interaction) {
    const target = interaction.options.getUser('usuario') ?? interaction.user;
    const requesterMember = interaction.member instanceof GuildMember ? interaction.member : null;
    const member = target.id === interaction.user.id ? requesterMember : null;

    await interaction.deferReply({ ephemeral: true });

    const { stats, leaderboard } = await getStatsUseCase.execute(BigInt(target.id));
    const displayName = target.globalName ?? target.username ?? target.tag;
    const card = await memberCardGenerator.render(stats, displayName);

    const embed = embedFactory.stats({
      title: `Resumen de ${target.username}`,
      stats: stats.summary(),
    });

    const leaderboardLines = leaderboard
      .map((entry, index) => `${index + 1}. <@${entry.userId}> - ${entry.tradesCompleted} trades`)
      .join('\n');

    embed.addFields({
      name: 'Top traders',
      value: leaderboardLines || 'Sin datos suficientes.',
    });

    if (!member) {
      embed.setFooter({ text: `Solicitado por ${interaction.user.tag}` });
    }

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [embed],
        files: card ? [card] : [],
      }),
    );
  },
};
