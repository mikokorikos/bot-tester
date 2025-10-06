// ============================================================================
// RUTA: src/application/services/FinalizationPanelService.ts
// ============================================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel } from 'discord.js';
import type { Logger } from 'pino';

import type { IMiddlemanRepository, MiddlemanClaim } from '@/domain/repositories/IMiddlemanRepository';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandMessageEditOptions, brandMessageOptions } from '@/shared/utils/branding';

export interface FinalizationParticipantPresentation {
  readonly id: bigint;
  readonly label: string;
}

interface RenderFinalizationPanelParams {
  readonly channel: TextChannel;
  readonly claim: MiddlemanClaim;
  readonly participants: ReadonlyArray<FinalizationParticipantPresentation>;
  readonly confirmedIds: ReadonlySet<bigint>;
  readonly completed: boolean;
  readonly embedFactory: EmbedFactory;
  readonly middlemanRepo: IMiddlemanRepository;
  readonly logger: Logger;
  readonly confirmButtonId: string;
  readonly cancelButtonId: string;
}

export const renderFinalizationPanel = async ({
  channel,
  claim,
  participants,
  confirmedIds,
  completed,
  embedFactory,
  middlemanRepo,
  logger,
  confirmButtonId,
}: RenderFinalizationPanelParams): Promise<void> => {
  const embed = embedFactory.finalizationPrompt({
    completed,
    participants: participants.map((participant) => ({
      label: participant.label,
      confirmed: confirmedIds.has(participant.id),
    })),
  });

  const components = completed
    ? []
    : [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(confirmButtonId)
            .setLabel('Confirmar trade')
            .setStyle(ButtonStyle.Success)
            .setDisabled(completed),
        ),
      ];

  const createPayload = () => ({
    embeds: [embed],
    components,
    allowedMentions: { parse: [] },
  });

  const existingMessageId = claim.finalizationMessageId;

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId.toString());
      await message.edit(brandMessageEditOptions(createPayload()));
      return;
    } catch (error) {
      logger.warn(
        { channelId: channel.id, messageId: existingMessageId.toString(), err: error },
        'No se pudo actualizar el panel de confirmacion final. Se enviara uno nuevo.',
      );
    }
  }

  const message = await channel.send(brandMessageOptions(createPayload()));
  await middlemanRepo.setFinalizationMessageId(claim.ticketId, BigInt(message.id));
};
