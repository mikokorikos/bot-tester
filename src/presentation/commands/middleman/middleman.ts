// ============================================================================
/* eslint-disable @typescript-eslint/no-unused-vars */

// RUTA: src/presentation/commands/middleman/middleman.ts

// ============================================================================

import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  Message,
  TextBasedChannel,
  TextChannel,
} from 'discord.js';
import { ChannelType, DiscordAPIError, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import { ZodError } from 'zod';

import { reviewInviteStore } from '@/application/services/ReviewInviteStore';
import { ClaimTradeUseCase } from '@/application/usecases/middleman/ClaimTradeUseCase';
import { CloseTradeUseCase } from '@/application/usecases/middleman/CloseTradeUseCase';
import { ConfirmFinalizationUseCase } from '@/application/usecases/middleman/ConfirmFinalizationUseCase';
import { ConfirmTradeUseCase } from '@/application/usecases/middleman/ConfirmTradeUseCase';
import { OpenMiddlemanChannelUseCase } from '@/application/usecases/middleman/OpenMiddlemanChannelUseCase';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { RevokeFinalizationUseCase } from '@/application/usecases/middleman/RevokeFinalizationUseCase';
import { SubmitReviewUseCase } from '@/application/usecases/middleman/SubmitReviewUseCase';
import { SubmitTradeDataUseCase } from '@/application/usecases/middleman/SubmitTradeDataUseCase';
import { UpdateCardConfigUseCase } from '@/application/usecases/middleman/UpdateCardConfigUseCase';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaMemberStatsRepository } from '@/infrastructure/repositories/PrismaMemberStatsRepository';
import { PrismaMiddlemanFinalizationRepository } from '@/infrastructure/repositories/PrismaMiddlemanFinalizationRepository';
import { PrismaMiddlemanRepository } from '@/infrastructure/repositories/PrismaMiddlemanRepository';
import { PrismaReviewRepository } from '@/infrastructure/repositories/PrismaReviewRepository';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import { PrismaTradeRepository } from '@/infrastructure/repositories/PrismaTradeRepository';
import type { Command } from '@/presentation/commands/types';
import { registerFinalizationCancelButton } from '@/presentation/components/buttons/FinalizationCancelButton';
import { registerFinalizationConfirmButton } from '@/presentation/components/buttons/FinalizationConfirmButton';
import {
  buildClaimButtonRow,
  MIDDLEMAN_CLAIM_BUTTON_ID,
} from '@/presentation/components/buttons/MiddlemanClaimButton';
import { parseReviewButtonCustomId,REVIEW_BUTTON_CUSTOM_ID } from '@/presentation/components/buttons/ReviewButtons';
import {
  TRADE_CONFIRM_BUTTON_ID,
  TRADE_DATA_BUTTON_ID,
  TRADE_HELP_BUTTON_ID,
} from '@/presentation/components/buttons/TradePanelButtons';
import { MiddlemanModal } from '@/presentation/components/modals/MiddlemanModal';
import { ReviewModal } from '@/presentation/components/modals/ReviewModal';
import { TradeModal } from '@/presentation/components/modals/TradeModal';
import { modalHandlers, registerButtonHandler, registerModalHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { buildClaimPromptMessage, buildTradeReadyMessage } from '@/presentation/middleman/messages';
import { TradePanelRenderer } from '@/presentation/middleman/TradePanelRenderer';
import { env } from '@/shared/config/env';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { TicketNotFoundError, UnauthorizedActionError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import {
  brandEditReplyOptions,
  brandMessageOptions,
  brandReplyOptions,
} from '@/shared/utils/branding';

const ticketRepo = new PrismaTicketRepository(prisma);

const tradeRepo = new PrismaTradeRepository(prisma);

const statsRepo = new PrismaMemberStatsRepository(prisma);

const middlemanRepo = new PrismaMiddlemanRepository(prisma);

const finalizationRepo = new PrismaMiddlemanFinalizationRepository(prisma);

const reviewRepo = new PrismaReviewRepository(prisma);

const openUseCase = new OpenMiddlemanChannelUseCase(ticketRepo, prisma, logger, embedFactory);

const claimUseCase = new ClaimTradeUseCase(ticketRepo, middlemanRepo, logger, embedFactory);

const closeUseCase = new CloseTradeUseCase(
  ticketRepo,
  tradeRepo,
  statsRepo,
  middlemanRepo,
  finalizationRepo,
  prisma,
  logger,
  embedFactory,
);

const submitReviewUseCase = new SubmitReviewUseCase(
  reviewRepo,
  ticketRepo,
  middlemanRepo,
  embedFactory,
  logger,
);

const updateCardConfigUseCase = new UpdateCardConfigUseCase(middlemanRepo, logger);

const submitTradeDataUseCase = new SubmitTradeDataUseCase(ticketRepo, tradeRepo, logger);

const confirmTradeUseCase = new ConfirmTradeUseCase(ticketRepo, tradeRepo, logger);

const confirmFinalizationUseCase = new ConfirmFinalizationUseCase(
  ticketRepo,
  finalizationRepo,
  middlemanRepo,
  embedFactory,
  logger,
);

const revokeFinalizationUseCase = new RevokeFinalizationUseCase(
  ticketRepo,
  finalizationRepo,
  middlemanRepo,
  embedFactory,
  logger,
);

const requestClosureUseCase = new RequestTradeClosureUseCase(
  ticketRepo,
  finalizationRepo,
  middlemanRepo,
  embedFactory,
  logger,
);

const tradePanelRenderer = new TradePanelRenderer(ticketRepo, tradeRepo, logger, embedFactory);

const middlemanSlashCommand = new SlashCommandBuilder()
  .setName('middleman')
  .setDescription('Accede a las herramientas del sistema de middleman')
  .setDMPermission(false);

export const middlemanCommand: Command = {
  data: middlemanSlashCommand,
  category: 'Middleman',
  async execute(interaction) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.info({
            title: 'Sistema de middleman',
            description:
              'Gestiona tus trades desde los botones disponibles en el ticket. Si necesitas soporte adicional, abre un ticket con el staff.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      }),
    );
  },
};

type SendableChannel = TextBasedChannel & { send: (...args: unknown[]) => unknown };

const isSendableChannel = (channel: TextBasedChannel | null): channel is SendableChannel =>
  Boolean(channel && typeof (channel as { send?: unknown }).send === 'function');

const HELP_UNLOCK_DURATION_MS = Math.max(5_000, env.MIDDLEMAN_HELP_UNLOCK_MS);
const MENTION_PATTERN = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/u;

const ensureMessageInGuild = async (message: Message, description?: string): Promise<boolean> => {
  if (message.guild) {
    return true;
  }

  await message.reply({
    embeds: [
      embedFactory.error({
        title: 'Accion no disponible',
        description: description ?? 'Este comando solo puede utilizarse dentro de un servidor.',
      }),
    ],
    allowedMentions: { repliedUser: false },
  });

  return false;
};

const ensureTextChannelFromMessage = async (
  message: Message,
  errorDescription: string,
): Promise<TextChannel | null> => {
  const channel = message.channel as TextChannel | null;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await message.reply({
      embeds: [
        embedFactory.warning({
          title: 'Canal no compatible',
          description: errorDescription,
        }),
      ],
      allowedMentions: { repliedUser: false },
    });

    return null;
  }

  return channel;
};


const resolvePartnerParticipantId = (
  ownerId: bigint,
  participants: ReadonlyArray<{ userId: bigint; role?: string | null }>,
): bigint | null => {
  const byRole = participants.find((participant) => {
    const role = participant.role ? participant.role.toUpperCase() : null;
    return role === 'PARTNER';
  });

  if (byRole) {
    return byRole.userId;
  }

  const fallback = participants.find((participant) => participant.userId !== ownerId);
  return fallback ? fallback.userId : null;
};

const collectParticipantIds = (
  ownerId: bigint,
  participants: ReadonlyArray<{ userId: bigint; role?: string | null }>,
): readonly bigint[] => {
  const partnerId = resolvePartnerParticipantId(ownerId, participants);
  return [ownerId, partnerId].filter((value): value is bigint => typeof value === 'bigint');
};

const updateSendPermission = async (
  channel: TextChannel,
  userId: bigint,
  allow: boolean,
): Promise<void> => {
  try {
    await channel.permissionOverwrites.edit(userId.toString(), { SendMessages: allow });
  } catch (error) {
    logger.warn(
      { channelId: channel.id, userId: userId.toString(), allow, err: error },
      'No se pudo actualizar los permisos de envo del usuario en el canal middleman.',
    );
  }
};
registerModalHandler('middleman-open', async (interaction) => {
  await MiddlemanModal.handleSubmit(interaction, openUseCase, {
    async renderPanel(channel, ticketId) {
      await tradePanelRenderer.render(channel, ticketId);
    },
  });
});

registerModalHandler(TradeModal.CUSTOM_ID, async (interaction) => {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'Canal incompatible',

            description: 'Este formulario solo puede utilizarse dentro de un canal de texto.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  const textChannel = channel;

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticket = await ticketRepo.findByChannelId(BigInt(channel.id));

    if (!ticket) {
      throw new TicketNotFoundError(channel.id);
    }

    const { robloxUsername, offerDescription } = TradeModal.parseFields(interaction);

    await submitTradeDataUseCase.execute({
      ticketId: ticket.id,

      userId: interaction.user.id,

      robloxUsername,

      offerDescription,
    });

    await tradePanelRenderer.render(textChannel, ticket.id);

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [
          embedFactory.success({
            title: 'Datos registrados',

            description: 'Tu informacion del trade se actualizo correctamente.',
          }),
        ],
      }),
    );
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al registrar datos de trade.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al registrar datos de trade.');
    }

    if (interaction.deferred || interaction.replied) {
      const { flags, ...editPayload } = payload;

      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,

          embeds: embeds ?? [
            embedFactory.error({
              title: 'No se pudo guardar tus datos',

              description: 'Intentalo nuevamente ms tarde o contacta al staff.',
            }),
          ],
        }),
      );

      return;
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,

        embeds: embeds ?? [
          embedFactory.error({
            title: 'No se pudo guardar tus datos',

            description: 'Intentalo nuevamente ms tarde o contacta al staff.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

registerFinalizationConfirmButton(confirmFinalizationUseCase, ticketRepo);
registerFinalizationCancelButton(revokeFinalizationUseCase, ticketRepo);

registerButtonHandler(REVIEW_BUTTON_CUSTOM_ID, async (interaction) => {
  const cachedInvite = reviewInviteStore.get(interaction.message.id);
  const buttonMetadata = parseReviewButtonCustomId(interaction.customId);

  let ticketId = cachedInvite?.ticketId ?? buttonMetadata?.ticketId ?? null;
  let middlemanId = cachedInvite?.middlemanId ?? buttonMetadata?.middlemanId ?? null;

  if ((!ticketId || !middlemanId) && interaction.channelId) {
    const ticket = await ticketRepo.findByChannelId(BigInt(interaction.channelId));
    if (ticket) {
      ticketId = ticket.id;
      const claim = await middlemanRepo.getClaimByTicket(ticket.id);
      if (claim) {
        middlemanId = claim.middlemanId.toString();
      }
    }
  }

  if (!ticketId || !middlemanId) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Formulario no disponible',

            description:
              'No pudimos validar este formulario de reseña. Solicita al staff que envíe una nueva invitación.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  reviewInviteStore.set(interaction.message.id, {
    ticketId,
    middlemanId,
  });

  const isParticipant = await ticketRepo.isParticipant(
    ticketId,
    BigInt(interaction.user.id),
  );

  if (!isParticipant) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.error({
            title: 'No puedes reseñar este ticket',

            description: 'Solo los participantes del ticket pueden enviar una reseña.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  const modalCustomId = `review:${ticketId}:${middlemanId}:${interaction.user.id}`;

  if (modalHandlers.has(modalCustomId)) {
    modalHandlers.delete(modalCustomId);
  }

  registerModalHandler(modalCustomId, async (modalInteraction) => {
    try {
      await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });

      const { rating, comment } = ReviewModal.parseFields(modalInteraction);

      if (!env.REVIEW_CHANNEL_ID) {
        await modalInteraction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.error({
                title: 'Configuración incompleta',

                description:
                  'No se pudo encontrar el canal de reseñas. Un administrador debe establecer `REVIEW_CHANNEL_ID` en el .env.',
              }),
            ],
          }),
        );

        return;
      }

      const channel = await modalInteraction.client.channels.fetch(env.REVIEW_CHANNEL_ID);

      if (!channel || channel.type !== ChannelType.GuildText) {
        await modalInteraction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.error({
                title: 'Canal inválido',

                description: 'El canal de reseñas configurado no es un canal de texto válido.',
              }),
            ],
          }),
        );

        return;
      }

      const middlemanUser = await modalInteraction.client.users
        .fetch(middlemanId)
        .catch(() => null);
      const middlemanDisplayName =
        middlemanUser?.globalName ?? middlemanUser?.username ?? `Middleman #${middlemanId}`;
      const middlemanAvatarUrl = middlemanUser?.displayAvatarURL({ extension: 'png', size: 256 }) ?? undefined;


      await submitReviewUseCase.execute(
        {
          ticketId,

          reviewerId: modalInteraction.user.id,

          middlemanId,

          rating,

          comment: comment ?? undefined,
          middlemanDisplayName,
          middlemanAvatarUrl,
        },

        channel,
      );

      await modalInteraction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.success({
              title: '¡Gracias por tu reseña!',

              description: 'Tu valoración se ha publicado correctamente en el canal de reseñas.',
            }),
          ],
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

      if (shouldLogStack) {
        logger.error(
          { err: error, referenceId },
          'Error inesperado al registrar reseña de middleman.',
        );
      } else {
        logger.warn(
          { err: error, referenceId },
          'Error controlado al registrar reseña de middleman.',
        );
      }

      if (modalInteraction.deferred || modalInteraction.replied) {
        const { flags, ...editPayload } = payload;

        await modalInteraction.editReply(
          brandEditReplyOptions({
            ...editPayload,

            embeds: embeds ?? [
              embedFactory.error({
                title: 'No se pudo registrar la reseña',

                description:
                  'Ocurrió un error al procesar tu reseña. Inténtalo nuevamente en unos minutos.',
              }),
            ],
          }),
        );

        return;
      }

      await modalInteraction.reply(
        brandReplyOptions({
          ...payload,

          embeds: embeds ?? [
            embedFactory.error({
              title: 'No se pudo registrar la reseña',

              description:
                'Ocurrió un error al procesar tu reseña. Inténtalo nuevamente en unos minutos.',
            }),
          ],

          flags: MessageFlags.Ephemeral,
        }),
      );
    } finally {
      modalHandlers.delete(modalCustomId);
    }
  });

  await interaction.showModal(ReviewModal.build(modalCustomId));
});

registerButtonHandler(TRADE_DATA_BUTTON_ID, async (interaction) => {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Accion no disponible',

            description: 'Este boton solo funciona dentro de un canal de trade.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  try {
    await interaction.showModal(TradeModal.build());
  } catch (error) {
    if (error instanceof DiscordAPIError) {
      if (error.code === RESTJSONErrorCodes.UnknownInteraction) {
        logger.warn(
          { interactionId: interaction.id, channelId: interaction.channelId, err: error },
          'La interaccion expiro antes de mostrar el modal de trade.',
        );

        return;
      }

      if (error.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged) {
        logger.warn(
          { interactionId: interaction.id, channelId: interaction.channelId, err: error },
          'Se intento reconocer nuevamente la interaccion antes de mostrar el modal de trade.',
        );

        return;
      }
    }

    throw error;
  }
});

registerButtonHandler(TRADE_CONFIRM_BUTTON_ID, async (interaction) => {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Accion no disponible',

            description: 'Este boton solo funciona dentro de un canal de trade.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  const textChannel = channel;

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticket = await ticketRepo.findByChannelId(BigInt(channel.id));

    if (!ticket) {
      throw new TicketNotFoundError(channel.id);
    }

    const result = await confirmTradeUseCase.execute({
      ticketId: ticket.id,

      userId: interaction.user.id,
    });

    await tradePanelRenderer.render(textChannel, ticket.id);

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [
          embedFactory.success({
            title: 'Confirmacion registrada',

            description: 'Tu confirmacion quedo registrada correctamente.',
          }),
        ],
      }),
    );

    if (result.ticketConfirmed) {
      const participants = await ticketRepo.listParticipants(ticket.id);

      const participantIds = collectParticipantIds(ticket.ownerId, participants);

      if (participantIds.length > 0) {
        await Promise.all(
          participantIds.map((participantId) =>
            updateSendPermission(textChannel, participantId, false),
          ),
        );
      }

      await tradePanelRenderer.render(textChannel, ticket.id);

      try {
        await textChannel.send(buildTradeReadyMessage(env.MIDDLEMAN_ROLE_ID));
        await textChannel.send(buildClaimPromptMessage(env.MIDDLEMAN_ROLE_ID));
      } catch (sendError) {
        logger.warn(
          { channelId: textChannel.id, interactionId: interaction.id, err: sendError },
          'No se pudo publicar las notificaciones de trade listo.',
        );
      }
    }
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al confirmar trade.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al confirmar trade.');
    }

    if (interaction.deferred || interaction.replied) {
      const { flags, ...editPayload } = payload;

      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,

          embeds: embeds ?? [
            embedFactory.error({
              title: 'No se pudo confirmar el trade',

              description: 'Int ntalo nuevamente o contacta al staff.',
            }),
          ],
        }),
      );

      return;
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,

        embeds: embeds ?? [
          embedFactory.error({
            title: 'No se pudo confirmar el trade',

            description: 'Int ntalo nuevamente o contacta al staff.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

registerButtonHandler(TRADE_HELP_BUTTON_ID, async (interaction) => {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Accion no disponible',

            description: 'Este boton solo funciona dentro de un canal de trade.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  const textChannel = channel;

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticket = await ticketRepo.findByChannelId(BigInt(textChannel.id));

    if (!ticket) {
      throw new TicketNotFoundError(textChannel.id);
    }

    const participants = await ticketRepo.listParticipants(ticket.id);
    const participantIds = collectParticipantIds(ticket.ownerId, participants);

    if (participantIds.length === 0) {
      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'No se encontraron participantes',

              description: 'No pudimos desbloquear el canal porque no hay participantes registrados.',
            }),
          ],
        }),
      );

      return;
    }

    await Promise.all(
      participantIds.map((participantId) => updateSendPermission(textChannel, participantId, true)),
    );

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [
          embedFactory.info({
            title: 'Canal desbloqueado temporalmente',

            description: 'Avisamos al staff. El canal se bloquear automticamente en unos instantes.',
          }),
        ],
      }),
    );

    const mention = env.ADMIN_ROLE_ID ? `<@&${env.ADMIN_ROLE_ID}>` : 'Equipo administrativo';
    const assistanceEmbed = embedFactory.info({
      title: 'Ayuda solicitada',

      description: [
        `${mention}, <@${interaction.user.id}> solicito asistencia en este trade.`,
        'El canal quedo desbloqueado temporalmente para coordinar detalles pendientes.',
      ].join('\n\n'),
    });

    await textChannel.send(
      brandMessageOptions({
        embeds: [assistanceEmbed],
        allowedMentions: env.ADMIN_ROLE_ID
          ? { roles: [env.ADMIN_ROLE_ID], users: [interaction.user.id] }
          : { users: [interaction.user.id] },
      }),
    );

    setTimeout(() => {
      void (async () => {
        try {
          const freshTicket = await ticketRepo.findById(ticket.id);
          if (!freshTicket) {
            return;
          }

          const freshParticipants = await ticketRepo.listParticipants(freshTicket.id);
          const freshParticipantIds = collectParticipantIds(freshTicket.ownerId, freshParticipants);

          if (freshParticipantIds.length > 0) {
            await Promise.all(
              freshParticipantIds.map((participantId) =>
                updateSendPermission(textChannel, participantId, false),
              ),
            );
          }

          await tradePanelRenderer.render(textChannel, freshTicket.id);

          await textChannel.send(
            brandMessageOptions({
              embeds: [
                embedFactory.info({
                  title: 'Canal bloqueado nuevamente',

                  description: 'Restauramos los permisos tras la solicitud de ayuda.',
                }),
              ],
              allowedMentions: { parse: [] },
            }),
          );
        } catch (lockError) {
          logger.warn(
            { channelId: textChannel.id, ticketId: ticket.id, err: lockError },
            'No se pudo relockear el canal tras la solicitud de ayuda.',
          );
        }
      })();
    }, HELP_UNLOCK_DURATION_MS).unref?.();
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error({ err: error, referenceId }, 'Error inesperado al solicitar ayuda en trade.');
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al solicitar ayuda en trade.');
    }

    if (interaction.deferred || interaction.replied) {
      const { flags, ...editPayload } = payload;

      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,

          embeds: embeds ?? [
            embedFactory.error({
              title: 'No se pudo solicitar ayuda',

              description: 'Intentalo nuevamente o contacta al staff.',
            }),
          ],
        }),
      );

      return;
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,

        embeds: embeds ?? [
          embedFactory.error({
            title: 'No se pudo solicitar ayuda',

            description: 'Intentalo nuevamente o contacta al staff.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});

registerButtonHandler(MIDDLEMAN_CLAIM_BUTTON_ID, async (interaction) => {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(
      brandReplyOptions({
        embeds: [
          embedFactory.warning({
            title: 'Accion no disponible',

            description: 'Este boton solo funciona dentro de un canal de middleman.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );

    return;
  }

  const textChannel = channel;

  try {
    const ticket = await ticketRepo.findByChannelId(BigInt(textChannel.id));

    if (!ticket) {
      throw new TicketNotFoundError(textChannel.id);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await claimUseCase.execute(
      {
        ticketId: ticket.id,
        middlemanId: interaction.user.id,
      },
      textChannel,
    );

    await tradePanelRenderer.render(textChannel, ticket.id);

    await interaction.editReply(
      brandEditReplyOptions({
        embeds: [
          embedFactory.success({
            title: 'Ticket reclamado',

            description: 'Ahora tienes control del ticket. Revisa el panel para continuar.',
          }),
        ],
      }),
    );

    try {
      await interaction.message.edit({ components: [buildClaimButtonRow({ disabled: true })] });
    } catch (error) {
      logger.warn(
        { err: error, interactionId: interaction.id },
        'No se pudo deshabilitar el boton de reclamo.',
      );
    }
  } catch (error) {
    const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

    if (shouldLogStack) {
      logger.error(
        { err: error, referenceId },
        'Error inesperado al reclamar ticket de middleman.',
      );
    } else {
      logger.warn({ err: error, referenceId }, 'Error controlado al reclamar ticket de middleman.');
    }

    if (interaction.deferred || interaction.replied) {
      const { flags, ...editPayload } = payload;

      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,

          embeds: embeds ?? [
            embedFactory.error({
              title: 'No se pudo reclamar el ticket',

              description:
                'Ocurrio un error al procesar tu solicitud. Intentalo nuevamente en unos minutos.',
            }),
          ],
        }),
      );

      return;
    }

    await interaction.reply(
      brandReplyOptions({
        ...payload,

        embeds: embeds ?? [
          embedFactory.error({
            title: 'No se pudo reclamar el ticket',

            description:
              'Ocurrio un error al procesar tu solicitud. Intentalo nuevamente en unos minutos.',
          }),
        ],

        flags: MessageFlags.Ephemeral,
      }),
    );
  }
});
