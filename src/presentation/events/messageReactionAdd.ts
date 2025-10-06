// ============================================================================
// RUTA: src/presentation/events/messageReactionAdd.ts
// ============================================================================

import { Events } from 'discord.js';

import type { EventDescriptor } from '@/presentation/events/types';
import { loadRuntimeConfig } from '@/shared/config/runtime';
import { logger } from '@/shared/logger/pino';

export const messageReactionAddEvent: EventDescriptor<typeof Events.MessageReactionAdd> = {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction, user) {
    if (user.bot) {
      return;
    }

    const config = await loadRuntimeConfig();
    if (config.reviewsChannelId && reaction.message.channelId !== config.reviewsChannelId) {
      return;
    }

    logger.debug(
      {
        emoji: reaction.emoji.name,
        userId: user.id,
        messageId: reaction.message.id,
      },
      'Reacción registrada en canal de reseñas.',
    );
  },
};
