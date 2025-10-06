// ============================================================================
// RUTA: src/application/usecases/tickets/CreateGeneralTicketUseCase.ts
// ============================================================================

import type { Guild, TextChannel } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Logger } from 'pino';

import {
  type CreateGeneralTicketDTO,
  CreateGeneralTicketSchema,
} from '@/application/dto/ticket.dto';
import { TicketType } from '@/domain/entities/types';
import type { CreateTicketData, ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { ChannelCleanupError, ChannelCreationError } from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';
import { sanitizeChannelName } from '@/shared/utils/discord.utils';

const MAX_OPEN_TICKETS_PER_TYPE = 2;

const ticketTypeLabels: Record<TicketType, string> = {
  [TicketType.BUY]: 'Compra',
  [TicketType.SELL]: 'Venta',
  [TicketType.ROBUX]: 'Robux',
  [TicketType.NITRO]: 'Nitro',
  [TicketType.DECOR]: 'Decoracion',
  [TicketType.MM]: 'Middleman',
};

export class CreateGeneralTicketUseCase {
  public constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly logger: Logger,
    private readonly embeds: EmbedFactory = embedFactory,
  ) {}

  public async execute(
    payload: CreateGeneralTicketDTO,
    guild: Guild,
  ): Promise<{ ticket: Awaited<ReturnType<ITicketRepository['create']>>; channel: TextChannel }>
  {
    const data = CreateGeneralTicketSchema.parse(payload);
    const ownerId = BigInt(data.userId);
    const guildId = BigInt(data.guildId);

    const openTickets = await this.ticketRepository.findOpenByOwner(ownerId);
    const openOfType = openTickets.filter((ticket) => ticket.type === data.type);

    if (openOfType.length >= MAX_OPEN_TICKETS_PER_TYPE) {
      throw new ChannelCreationError(
        `Ya tienes ${MAX_OPEN_TICKETS_PER_TYPE} tickets de tipo ${ticketTypeLabels[data.type]} abiertos.`,
      );
    }

    const channelName = sanitizeChannelName(`${data.type.toLowerCase()}-${data.userId}`);
    const botId = guild.members.me?.id;

    if (!botId) {
      throw new ChannelCreationError('El bot no tiene presencia en el servidor.');
    }

    let createdChannel: TextChannel;
    try {
      createdChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: data.reason.slice(0, 100),
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: data.userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: botId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });
    } catch (error) {
      this.logger.error({ err: error, channelName }, 'Error creando canal para ticket general.');
      throw new ChannelCreationError((error as Error).message);
    }

    const ticketData: CreateTicketData = {
      guildId,
      channelId: BigInt(createdChannel.id),
      ownerId,
      type: data.type,
      participants: [
        { userId: ownerId, role: 'OWNER' },
      ],
    };

    try {
      const ticket = await this.ticketRepository.create(ticketData);

      const ownerMention = `<@${data.userId}>`;
      const ticketEmbed = this.embeds.ticketCreated({
        ticketId: ticket.id,
        type: ticketTypeLabels[data.type],
        ownerTag: ownerMention,
        description: data.reason,
      });

      const descriptionParts = [`**Participante:** ${ownerMention}`];
      const sanitizedReason = data.reason.trim();
      if (sanitizedReason.length > 0) {
        descriptionParts.push('', sanitizedReason);
      }

      ticketEmbed.setDescription(descriptionParts.join('\n'));

      await createdChannel.send(
        brandMessageOptions({
          embeds: [ticketEmbed],
          allowedMentions: { users: [data.userId], repliedUser: false },
        }),
      );

      this.logger.info(
        { ticketId: ticket.id, channelId: createdChannel.id, type: data.type },
        'Ticket general creado correctamente.',
      );

      return { ticket, channel: createdChannel };
    } catch (error) {
      this.logger.error({ err: error, ownerId: data.userId }, 'Fallo al persistir ticket general.');

      try {
        await createdChannel.delete('Fallo al registrar el ticket general.');
      } catch (cleanupError) {
        this.logger.error({ err: cleanupError, channelId: createdChannel.id }, 'No se pudo eliminar el canal fallido.');
        throw new ChannelCleanupError(createdChannel.id, cleanupError);
      }

      throw error;
    }
  }
}
