// ============================================================================
// RUTA: src/presentation/components/buttons/FinalizationCancelButton.ts
// ============================================================================

import type { ButtonInteraction, TextChannel } from 'discord.js';

import type { RevokeFinalizationUseCase } from '@/application/usecases/middleman/RevokeFinalizationUseCase';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { registerButtonHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandReplyOptions } from '@/shared/utils/branding';

const CUSTOM_ID = 'middleman:finalization:cancel';

export const registerFinalizationCancelButton = (
  useCase: RevokeFinalizationUseCase,
  ticketRepository: ITicketRepository,
): void => {
  registerButtonHandler(CUSTOM_ID, async (interaction: ButtonInteraction) => {
    if (!interaction.inCachedGuild() || !interaction.channel) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Accion no disponible',
              description: 'Esta accion solo esta disponible dentro del servidor.',
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
        throw new Error('No se encontro el ticket asociado a este canal.');
      }

      const result = await useCase.execute(
        ticket.id,
        BigInt(interaction.user.id),
        interaction.channel as TextChannel,
      );

      if (!result.previouslyConfirmed) {
        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.info({
                title: 'Sin confirmacion registrada',
                description: 'Aun no habias confirmado este trade. Espera a que el middleman valide el cierre.',
              }),
            ],
          }),
        );
        return;
      }

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.warning({
              title: 'Confirmacion retirada',
              description: 'Tu confirmacion fue anulada. Puedes volver a confirmarla cuando estes listo.',
            }),
          ],
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);
      const logPayload = { err: error, referenceId, interactionId: interaction.id };

      if (shouldLogStack) {
        logger.error(logPayload, 'Error inesperado al cancelar confirmacion de trade.');
      } else {
        logger.warn(logPayload, 'Error controlado al cancelar confirmacion de trade.');
      }

      const { flags, ...rest } = payload;
      await interaction.editReply(
        brandEditReplyOptions({
          ...rest,
          embeds,
        }),
      );
    }
  });
};

export const FINALIZATION_CANCEL_BUTTON_ID = CUSTOM_ID;
