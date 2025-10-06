// ============================================================================
// RUTA: src/presentation/components/buttons/FinalizationConfirmButton.ts
// ============================================================================

import type { ButtonInteraction, TextChannel } from 'discord.js';

import type { ConfirmFinalizationUseCase } from '@/application/usecases/middleman/ConfirmFinalizationUseCase';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { registerButtonHandler } from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandReplyOptions } from '@/shared/utils/branding';

const CUSTOM_ID = 'middleman:finalization:confirm';

export const registerFinalizationConfirmButton = (
  useCase: ConfirmFinalizationUseCase,
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

      const result = await useCase.execute(ticket.id, BigInt(interaction.user.id), interaction.channel as TextChannel);

      if (result.alreadyConfirmed) {
        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.info({
                title: 'Confirmacion previa detectada',
                description: 'Ya habias confirmado este trade anteriormente.',
              }),
            ],
          }),
        );
        return;
      }

      if (result.completed) {
        await interaction.editReply(
          brandEditReplyOptions({
            embeds: [
              embedFactory.success({
                title: 'Confirmaciones completas',
                description:
                  'Gracias. Ambas confirmaciones quedaron registradas. El middleman podra cerrar el ticket.',
              }),
            ],
          }),
        );
        return;
      }

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.info({
              title: 'Confirmacion registrada',
              description: 'Espera a que el otro trader confirme el cierre.',
            }),
          ],
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...payload } = mapErrorToDiscordResponse(error);

      const logPayload = { err: error, referenceId, interactionId: interaction.id };
      if (shouldLogStack) {
        logger.error(logPayload, 'Error inesperado al registrar confirmacion final de trade.');
      } else {
        logger.warn(logPayload, 'Error controlado al registrar confirmacion final de trade.');
      }

      const { flags, ...editPayload } = payload;
      await interaction.editReply(
        brandEditReplyOptions({
          ...editPayload,
          embeds,
        }),
      );
    }
  });
};

export const FINALIZATION_CONFIRM_BUTTON_ID = CUSTOM_ID;
