// ============================================================================
// RUTA: src/presentation/events/guildMemberAdd.ts
// ============================================================================

import { Events } from 'discord.js';

import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { EventDescriptor } from '@/presentation/events/types';
import { logger } from '@/shared/logger/pino';
import { dmQueue } from '@/shared/utils/dm-queue';

export const guildMemberAddEvent: EventDescriptor<typeof Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    try {
      await dmQueue.enqueue(member.user, {
        embeds: [
          embedFactory.info({
            title: '¡Bienvenido a Dedos Shop!',
            description:
              'Gracias por unirte a la comunidad. Lee las reglas del servidor y utiliza `/help` para conocer los comandos disponibles.',
          }),
        ],
      });
      logger.info({ userId: member.id }, 'Mensaje de bienvenida enviado.');
    } catch (error) {
      logger.warn({ err: error, userId: member.id }, 'No se pudo enviar el DM de bienvenida.');
    }
  },
};
