// ============================================================================
// RUTA: src/presentation/components/modals/MiddlemanModal.ts
// ============================================================================

import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  type TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import type { OpenMiddlemanChannelUseCase } from '@/application/usecases/middleman/OpenMiddlemanChannelUseCase';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { env } from '@/shared/config/env';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { logger } from '@/shared/logger/pino';
import { brandEditReplyOptions, brandReplyOptions } from '@/shared/utils/branding';

const CONTEXT_ID = 'context';
const PARTNER_ID = 'partner';
export class MiddlemanModal {
  public static build(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId('middleman-open')
      .setTitle('Abrir Ticket de Middleman')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(CONTEXT_ID)
            .setLabel('Descripción del trade')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe qué necesitas...')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(PARTNER_ID)
            .setLabel('Compañero (mención o ID)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
      );
  }

  public static async handleSubmit(
    interaction: ModalSubmitInteraction,
    useCase: OpenMiddlemanChannelUseCase,
    options: { renderPanel?: (channel: TextChannel, ticketId: number) => Promise<void> } = {},
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description:
                'Este formulario solo puede utilizarse dentro de un servidor de Discord.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    const context = interaction.fields.getTextInputValue(CONTEXT_ID);
    const partnerTag = interaction.fields.getTextInputValue(PARTNER_ID);

    if (!env.MIDDLEMAN_CATEGORY_ID) {
      await interaction.reply(
        brandReplyOptions({
          embeds: [
            embedFactory.error({
              title: 'Configuración incompleta',
              description:
                'El bot no tiene configurada la categoría de middleman. Un administrador debe definir `MIDDLEMAN_CATEGORY_ID` en el archivo .env.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        }),
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { ticket, channel } = await useCase.execute(
        {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          type: 'MM',
          context,
          partnerTag,
          categoryId: env.MIDDLEMAN_CATEGORY_ID,
        },
        interaction.guild,
      );

      if (options.renderPanel) {
        await options.renderPanel(channel, ticket.id);
      }

      await interaction.editReply(
        brandEditReplyOptions({
          embeds: [
            embedFactory.success({
              title: 'Ticket creado',
              description: `Tu ticket #${ticket.id} fue creado correctamente en ${channel.toString()}.`,
            }),
          ],
        }),
      );
    } catch (error) {
      const { shouldLogStack, referenceId, embeds, ...messagePayload } =
        mapErrorToDiscordResponse(error);

      const logPayload = { err: error, referenceId };
      if (shouldLogStack) {
        logger.error(logPayload, 'Error al crear ticket de middleman.');
      } else {
        logger.warn(logPayload, 'Error controlado al crear ticket de middleman.');
      }

      const payload = {
        ...messagePayload,
        embeds: embeds ?? [
          embedFactory.error({
            title: 'No se pudo crear el ticket',
            description:
              'Ocurrió un error durante el proceso de creación. Verifica que cumples los requisitos e inténtalo nuevamente.',
          }),
        ],
      };

      if (interaction.deferred || interaction.replied) {
        const { flags, ...editPayload } = payload;
        await interaction.editReply(brandEditReplyOptions(editPayload));
      } else {
        await interaction.reply(brandReplyOptions(payload));
      }
    }
  }
}
