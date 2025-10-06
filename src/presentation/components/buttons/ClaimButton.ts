// ============================================================================
// RUTA: src/presentation/components/buttons/ClaimButton.ts
// ============================================================================

import type { ButtonInteraction, TextChannel } from 'discord.js';

import type { ClaimTradeUseCase } from '@/application/usecases/middleman/ClaimTradeUseCase';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { registerButtonHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandReplyOptions } from '@/shared/utils/branding';

const CUSTOM_ID = 'middleman-claim';

export const registerClaimButton = (
  useCase: ClaimTradeUseCase,
  ticketRepository: ITicketRepository,
): void => {
  registerButtonHandler(CUSTOM_ID, async (interaction: ButtonInteraction) => {
    if (!interaction.inCachedGuild() || !interaction.channel) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Accion no disponible',
              description: 'Este boton solo puede usarse dentro de un servidor.',
            }),
          ],
          ephemeral: true,
        }),
      );
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const ticket = await ticketRepository.findByChannelId(BigInt(interaction.channelId));
      if (!ticket) {
        throw new Error('Ticket no encontrado para este canal.');
      }

      await useCase.execute(
        { ticketId: ticket.id, middlemanId: interaction.user.id },
        interaction.channel as TextChannel,
      );

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.success({
              title: 'Ticket reclamado',
              description: 'Has reclamado el ticket correctamente. Revisa el canal para continuar el flujo.',
            }),
          ],
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

      const logPayload = { err: error, referenceId, interactionId: interaction.id };
      if (shouldLogStack) {
        logger.error(logPayload, 'Error al reclamar ticket middleman.');
      } else {
        logger.warn(logPayload, 'Error controlado al reclamar ticket middleman.');
      }

      const { ephemeral, flags, ...editPayload } = payload;

      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,
          embeds,
        }),
      );
    }
  });
};

export const claimButtonCustomId = CUSTOM_ID;
