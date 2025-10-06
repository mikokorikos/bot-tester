// ============================================================================
// RUTA: src/presentation/commands/tickets/tickets.ts
// ============================================================================

import {
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { OpenSupportTicketUseCase } from '@/application/usecases/tickets/OpenSupportTicketUseCase';
import { TicketType } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import type { Command } from '@/presentation/commands/types';
import { MiddlemanModal } from '@/presentation/components/modals/MiddlemanModal';
import { registerSelectMenuHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  buildTicketPanelMessage,
  resolveTicketType,
  TICKET_PANEL_MENU_ID,
} from '@/presentation/tickets/TicketPanelBuilder';
import { env } from '@/shared/config/env';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { ValidationFailedError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandMessageOptions, brandReplyOptions } from '@/shared/utils/branding';

const ticketRepository = new PrismaTicketRepository(prisma);

const supportTicketUseCase = new OpenSupportTicketUseCase(
  ticketRepository,
  logger,
  {
    categoryId: env.TICKET_CATEGORY_ID ?? '',
    staffRoleIds: env.TICKET_STAFF_ROLE_IDS,
    maxTicketsPerUser: env.TICKET_MAX_PER_USER,
    cooldownMs: env.TICKET_COOLDOWN_MS,
  },
  embedFactory,
);

const ensureGuildMember = (member: unknown): GuildMember => {
  if (!member || typeof member !== 'object' || !('user' in member)) {
    throw new ValidationFailedError({
      member: 'No fue posible identificar al miembro que solicitó el ticket.',
    });
  }

  return member as GuildMember;
};

registerSelectMenuHandler(TICKET_PANEL_MENU_ID, async (interaction) => {
  if (!interaction.guild) {
    await interaction.reply(

      brandReplyOptions({

        embeds: [

          embedFactory.error({

            title: 'Accion no disponible',

            description: 'Este menu solo puede usarse dentro de un servidor de Discord.',

          }),

        ],

        flags: MessageFlags.Ephemeral,

      }),

    );
    return;
  }

  try {
    const type = resolveTicketType(interaction);

    if (type === TicketType.MM) {
      await interaction.showModal(MiddlemanModal.build());
      return;
    }

    const member = ensureGuildMember(interaction.member);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { ticket, channel } = await supportTicketUseCase.execute({
      guild: interaction.guild,
      member,
      type,
    });

    await interaction.editReply(

      brandEditReplyOptions({

        embeds: [

          embedFactory.success({

            title: 'Ticket creado',

            description: `Tu ticket #${ticket.id} esta listo en ${channel.toString()}.`,

          }),

        ],

      }),

    );
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al crear ticket de soporte.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al crear ticket de soporte.');
    }

    if (interaction.deferred || interaction.replied) {
      const { flags, ...editPayload } = payload;
      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,
          embeds:
            embeds ?? [
              embedFactory.error({
                title: 'No se pudo crear el ticket',
                description: 'Verifica los requisitos e intentalo nuevamente mas tarde.',
              }),
            ],
        }),
      );
      return;
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,
        embeds:
          embeds ?? [
            embedFactory.error({
              title: 'No se pudo crear el ticket',
              description: 'Verifica los requisitos e intentalo nuevamente mas tarde.',
            }),
          ],
        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

const publishTicketPanel = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const panel = buildTicketPanelMessage();

  await interaction.reply(
    brandReplyOptions({
      ...panel,
      allowedMentions: { parse: [] },
    }),
  );
};

export const ticketsPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Publica el panel interactivo para crear tickets de soporte.'),
  category: 'Tickets',
  examples: ['/tickets', `${env.COMMAND_PREFIX}tickets`],
  prefix: {
    name: 'tickets',
    async execute(message) {
      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply(
          brandMessageOptions({
            embeds: [
              embedFactory.warning({
                title: 'Canal no compatible',
                description: 'El panel solo puede publicarse en canales de texto del servidor.',
              }),
            ],
            allowedMentions: { repliedUser: false },
          }),
        );
        return;
      }

      const panel = buildTicketPanelMessage();
      await message.channel.send(
        brandMessageOptions({
          ...panel,
          allowedMentions: { parse: [] },
        }),
      );
    },
  },
  async execute(interaction) {
    await publishTicketPanel(interaction);
  },
};
