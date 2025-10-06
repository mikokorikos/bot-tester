// =============================================================================
// RUTA: src/presentation/components/buttons/MiddlemanClaimButton.ts
// =============================================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const MIDDLEMAN_CLAIM_BUTTON_ID = 'middleman:claim';

export const buildClaimButtonRow = (options: { disabled?: boolean } = {}): ActionRowBuilder<ButtonBuilder> => {
  const { disabled = false } = options;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MIDDLEMAN_CLAIM_BUTTON_ID)
      .setLabel('Reclamar middleman')
      .setEmoji('🤝')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
};

