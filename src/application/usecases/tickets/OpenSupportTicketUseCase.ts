// ============================================================================
// RUTA: src/application/usecases/tickets/OpenSupportTicketUseCase.ts
// ============================================================================

import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import type { Logger } from 'pino';

import type { Ticket } from '@/domain/entities/Ticket';
import type { TicketType } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  ChannelCreationError,
  TooManyOpenTicketsError,
  ValidationFailedError,
} from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';
import { sanitizeChannelName } from '@/shared/utils/discord.utils';
import { snapshotFromMember } from '@/shared/utils/discordIdentity';

const cooldownTracker = new Map<string, number>();

const buildCooldownKey = (userId: string, type: TicketType): string => `${userId}:${type}`;

interface OpenSupportTicketOptions {
  readonly categoryId: string;
  readonly staffRoleIds: readonly string[];
  readonly maxTicketsPerUser: number;
  readonly cooldownMs: number;
}

interface OpenSupportTicketParams {
  readonly guild: Guild;
  readonly member: GuildMember;
  readonly type: TicketType;
  readonly reason?: string;
}

export class OpenSupportTicketUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly logger: Logger,
    private readonly options: OpenSupportTicketOptions,
    private readonly embeds: EmbedFactory = embedFactory,
  ) {}

  public async execute({ guild, member, type, reason }: OpenSupportTicketParams): Promise<{
    readonly ticket: Ticket;
    readonly channel: TextChannel;
  }> {
    if (!this.options.categoryId) {
      throw new ValidationFailedError({ categoryId: 'Debe configurarse TICKET_CATEGORY_ID en el entorno.' });
    }

    const ownerId = BigInt(member.id);
    const guildId = BigInt(guild.id);

    const openTickets = await this.ticketRepo.countOpenByOwner(ownerId);
    if (openTickets >= this.options.maxTicketsPerUser) {
      throw new TooManyOpenTicketsError(this.options.maxTicketsPerUser);
    }

    const cooldownKey = buildCooldownKey(member.id, type);
    const lastOpenedAt = cooldownTracker.get(cooldownKey) ?? 0;
    const now = Date.now();
    const remaining = this.options.cooldownMs - (now - lastOpenedAt);

    if (this.options.cooldownMs > 0 && remaining > 0) {
      throw new ValidationFailedError({
        cooldown: `Debes esperar ${Math.ceil(remaining / 1000)} segundos antes de crear otro ticket de este tipo.`,
      });
    }

    const botId = guild.members.me?.id;
    if (!botId) {
      throw new ChannelCreationError('El bot no se encuentra en el servidor.');
    }

    const baseName = `${type.toLowerCase()}-${member.displayName ?? member.user.username}`;
    const channelName = sanitizeChannelName(baseName);

    let createdChannel: TextChannel;
    try {
      createdChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: this.options.categoryId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
            type: OverwriteType.Role,
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Member,
          },
          ...this.options.staffRoleIds.map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Role,
          })),
          {
            id: botId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            type: OverwriteType.Member,
          },
        ],
      });
    } catch (error) {
      this.logger.error({ err: error, type, memberId: member.id }, 'Falló la creación del canal de ticket.');
      throw new ChannelCreationError((error as Error).message);
    }

    try {
      const ticket = await this.ticketRepo.create({
        guildId,
        channelId: BigInt(createdChannel.id),
        ownerId,
        type,
        participants: [{ userId: ownerId, role: 'OWNER' }],
        userSnapshots: [snapshotFromMember(member)],
      });

      cooldownTracker.set(cooldownKey, now);

      const mentionRoles = this.options.staffRoleIds;
      const ticketEmbed = this.embeds.ticketCreated({
        ticketId: ticket.id,
        type: type.toLowerCase(),
        ownerTag: `<@${member.id}>`,
        description:
          reason ?? 'Describe tu situacion y un miembro del staff te ayudara lo antes posible.',
      });

      const mentionLine = mentionRoles.length
        ? mentionRoles.map((roleId) => `<@&${roleId}>`).join(' ')
        : null;

      if (mentionLine) {
        const descriptionParts = [
          `**Aviso para:** ${mentionLine}`,
          ticketEmbed.data.description ?? '',
        ].filter((line) => line.length > 0);
        ticketEmbed.setDescription(descriptionParts.join('\n\n'));
      }

      await createdChannel.send(
        brandMessageOptions({
          embeds: [ticketEmbed],
          allowedMentions: { roles: mentionRoles },
        }),
      );

      this.logger.info(
        { ticketId: ticket.id, channelId: createdChannel.id, ownerId: member.id, type },
        'Ticket de soporte creado correctamente.',
      );

      return { ticket, channel: createdChannel };
    } catch (error) {
      this.logger.error({ err: error, memberId: member.id }, 'Falló la persistencia del ticket.');

      try {
        await createdChannel.delete('Error al registrar ticket en la base de datos.');
      } catch (cleanupError) {
        this.logger.error(
          { err: cleanupError, channelId: createdChannel.id },
          'No se pudo eliminar el canal tras un fallo en el ticket.',
        );
      }

      throw error;
    }
  }
}
