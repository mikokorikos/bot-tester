// =============================================================================
// RUTA: src/presentation/components/modals/ReviewModal.ts
// =============================================================================

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

const RATING_ID = 'rating';
const COMMENT_ID = 'comment';

export class ReviewModal {
  public static build(customId: string): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle('Califica al middleman')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(RATING_ID)
            .setLabel('Calificación (1-5)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1)
            .setPlaceholder('5'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(COMMENT_ID)
            .setLabel('Comentario (opcional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder('Comparte tu experiencia (máx. 500 caracteres).'),
        ),
      );
  }

  public static parseFields(interaction: { fields: { getTextInputValue(id: string): string } }): {
    rating: number;
    comment: string | null;
  } {
    const ratingRaw = interaction.fields.getTextInputValue(RATING_ID).trim();
    const rating = Number.parseInt(ratingRaw, 10);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('El rating debe ser un número entre 1 y 5.');
    }

    const comment = interaction.fields.getTextInputValue(COMMENT_ID).trim();

    return {
      rating,
      comment: comment.length > 0 ? comment : null,
    };
  }
}
