// ============================================================================
// RUTA: src/presentation/components/modals/TradeModal.ts
// ============================================================================

import {
  ActionRowBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

const ROBLOX_ID = 'roblox';
const OFFER_ID = 'offer';

export interface TradeModalPayload {
  readonly robloxUsername: string;
  readonly offerDescription: string;
}

export class TradeModal {
  public static readonly CUSTOM_ID = 'middleman-trade';

  public static build(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId(TradeModal.CUSTOM_ID)
      .setTitle('Mis datos de trade')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ROBLOX_ID)
            .setLabel('Usuario de Roblox')
            .setPlaceholder('Ej. Mikokorikos')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(50)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(OFFER_ID)
            .setLabel('¿Qué ofreces?')
            .setPlaceholder('Incluye cantidades y moneda si aplica')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(5)
            .setMaxLength(1000)
            .setRequired(true),
        ),
      );
  }

  public static parseFields(interaction: ModalSubmitInteraction): TradeModalPayload {
    const robloxUsername = interaction.fields.getTextInputValue(ROBLOX_ID).trim();
    const offerDescription = interaction.fields.getTextInputValue(OFFER_ID).trim();

    return { robloxUsername, offerDescription };
  }
}
