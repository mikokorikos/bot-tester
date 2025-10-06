// ============================================================================
// RUTA: src/presentation/commands/admin/db.ts
// ============================================================================

import { GuildMember, SlashCommandBuilder } from 'discord.js';

import { TicketStatus } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { PERMISSIONS } from '@/shared/config/constants';
import { hasPermissions } from '@/shared/utils/permissions';

export const dbCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('db')
    .setDescription('Consultas rápidas a la base de datos')
    .addSubcommand((sub) =>
      sub
        .setName('tickets')
        .setDescription('Lista los últimos tickets abiertos')
        .addStringOption((option) =>
          option
            .setName('estado')
            .setDescription('Filtra por estado (OPEN, CLAIMED, CLOSED)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('warns')
        .setDescription('Lista las advertencias de un usuario')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Miembro a consultar').setRequired(true),
        ),
    ),
  category: 'Administración',
  examples: ['/db tickets', '/db warns usuario:@Miembro'],
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

    if (subcommand === 'tickets') {
      const status = interaction.options.getString('estado') ?? undefined;

      await interaction.deferReply({ ephemeral: true });

      const normalizedStatus = status?.toUpperCase();

      if (
        normalizedStatus &&
        !Object.values(TicketStatus).includes(normalizedStatus as TicketStatus)
      ) {
        await interaction.editReply({
          embeds: [
            embedFactory.error({
              title: 'Estado inválido',
              description: 'Usa uno de los estados: OPEN, CONFIRMED, CLAIMED, CLOSED.',
            }),
          ],
        });
        return;
      }

      const tickets = await prisma.ticket.findMany({
        where: normalizedStatus
          ? {
              status: normalizedStatus as TicketStatus,
            }
          : {},
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const rows = tickets.map(
        (ticket) =>
          `#${ticket.id} — ${ticket.type} — ${ticket.status} — <#${ticket.channelId}> — owner: <@${ticket.ownerId.toString()}>`,
      );

      await interaction.editReply({
        embeds: [
          embedFactory.info({
            title: 'Tickets recientes',
            description: rows.join('\n') || 'No se encontraron tickets con el criterio especificado.',
          }),
        ],
      });
      return;
    }

    if (subcommand === 'warns') {
      const target = interaction.options.getUser('usuario', true);

      await interaction.deferReply({ ephemeral: true });

      const warns = await prisma.warn.findMany({
        where: { userId: BigInt(target.id) },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const rows = warns.map(
        (warn) =>
          `#${warn.id} — ${warn.severity} — ${warn.reason ?? 'Sin motivo'} — moderador: ${warn.moderatorId ?? 'N/A'}`,
      );

      await interaction.editReply({
        embeds: [
          embedFactory.info({
            title: `Warns de ${target.username}`,
            description: rows.join('\n') || 'Sin advertencias registradas.',
          }),
        ],
      });
      return;
    }
  },
};
