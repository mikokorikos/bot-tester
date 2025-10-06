// ============================================================================
// RUTA: src/presentation/middleman/TradePanelRenderer.ts
// ============================================================================

import type { TextChannel } from 'discord.js';
import type { Logger } from 'pino';

import { tradePanelStore } from '@/application/services/TradePanelStore';
import type { Ticket } from '@/domain/entities/Ticket';
import type { Trade } from '@/domain/entities/Trade';
import { TicketStatus } from '@/domain/entities/types';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import { buildTradePanelButtons } from '@/presentation/components/buttons/TradePanelButtons';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandMessageEditOptions, brandMessageOptions } from '@/shared/utils/branding';

const hasDescriptionMetadata = (
  value: unknown,
): value is { description?: unknown } => typeof value === 'object' && value !== null && 'description' in value;

const formatTradeSummary = (trade: Trade | undefined): string => {
  if (!trade) {
    return [
      '• Roblox: Sin registrar',
      '• Oferta: Sin registrar',
      '• Confirmación: Pendiente',
    ].join('\n');
  }

  const metadata = trade.items[0]?.metadata;
  const rawDescription = hasDescriptionMetadata(metadata) ? metadata.description : null;
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : null;

  return [
    `• Roblox: **${trade.robloxUsername}**`,
    description ? `• Oferta: ${description}` : '• Oferta: Sin registrar',
    `• Confirmación: ${trade.confirmed ? 'Registrada' : 'Pendiente'}`,
  ].join('\n');
};

const resolvePartnerId = (
  ticket: Ticket,
  participants: Awaited<ReturnType<ITicketRepository['listParticipants']>>,
): bigint | null => {
  const partner = participants.find((participant) => participant.userId !== ticket.ownerId);
  return partner?.userId ?? null;
};

export class TradePanelRenderer {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly tradeRepo: ITradeRepository,
    private readonly logger: Logger,
    private readonly embeds: EmbedFactory = embedFactory,
  ) {}

  public async render(channel: TextChannel, ticketId: number): Promise<void> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      this.logger.warn({ ticketId, channelId: channel.id }, 'No se pudo renderizar panel: ticket inexistente.');
      return;
    }

    const [participants, trades] = await Promise.all([
      this.ticketRepo.listParticipants(ticket.id),
      this.tradeRepo.findByTicketId(ticket.id),
    ]);

    const ownerMention = `<@${ticket.ownerId.toString()}>`;
    const partnerId = resolvePartnerId(ticket, participants);
    const partnerMention = partnerId ? `<@${partnerId.toString()}>` : 'Pendiente de registrar';

    const ownerTrade = trades.find((trade) => trade.userId === ticket.ownerId);
    const partnerTrade = partnerId ? trades.find((trade) => trade.userId === partnerId) : undefined;

    const allConfirmed = trades.length >= 2 && trades.every((trade) => trade.confirmed);

    let statusLabel: string;
    if (ticket.status === TicketStatus.CLOSED) {
      statusLabel = 'Trade finalizado';
    } else if (ticket.status === TicketStatus.CLAIMED) {
      statusLabel = 'Atendido por middleman';
    } else if (ticket.status === TicketStatus.CONFIRMED && allConfirmed) {
      statusLabel = 'Trade listo para middleman';
    } else if (ownerTrade && partnerTrade && allConfirmed) {
      statusLabel = 'Confirmaciones registradas';
    } else {
      statusLabel = 'Pendiente de confirmación';
    }

    const locked =
      ticket.status === TicketStatus.CONFIRMED || ticket.status === TicketStatus.CLOSED;

    const summarySections = [
      `**${ownerMention}**\n${formatTradeSummary(ownerTrade)}`,
      `**${partnerMention}**\n${formatTradeSummary(partnerTrade)}`,
    ];

    if (ticket.status === TicketStatus.CLOSED) {
      summarySections.push('El trade fue marcado como finalizado.');
    } else if (ticket.status === TicketStatus.CONFIRMED && allConfirmed) {
      summarySections.push('El trade está listo. Espera a que un middleman lo reclame.');
    } else if (ticket.status === TicketStatus.CLAIMED && ticket.assignedMiddlemanId) {
      summarySections.push(`Middleman asignado: <@${ticket.assignedMiddlemanId.toString()}>.`);
    } else if (!ownerTrade || !partnerTrade) {
      summarySections.push('Ambos traders deben registrar sus datos de trade antes de confirmar.');
    } else if (!allConfirmed) {
      const pendingMentions: string[] = [];

      if (!ownerTrade.confirmed) {
        pendingMentions.push(ownerMention);
      }

      if (!partnerTrade?.confirmed) {
        pendingMentions.push(partnerMention);
      }

      if (pendingMentions.length > 0) {
        const pendingSummary =
          pendingMentions.length === 1
            ? `Confirmación pendiente de ${pendingMentions[0]}.`
            : `Confirmación pendiente de ${pendingMentions[0]} y ${pendingMentions[1]}.`;
        summarySections.push(pendingSummary);
      }
    }

    const embed = this.embeds.middlemanPanel({
      ticketId: ticket.id,
      buyerTag: ownerMention,
      sellerTag: partnerMention,
      status: statusLabel,
      notes: summarySections.join('\n\n'),
    });

    const canConfirm =
      ticket.status === TicketStatus.OPEN && Boolean(ownerTrade && partnerTrade && !allConfirmed);

    const sendPayload = brandMessageOptions({
      embeds: [embed],
      components: [buildTradePanelButtons({ canConfirm, locked })],
      allowedMentions: { parse: [] },
    });

    const editPayload = brandMessageEditOptions({
      embeds: sendPayload.embeds,
      components: sendPayload.components,
      allowedMentions: sendPayload.allowedMentions,
    });

    const storedMessageId = tradePanelStore.get(channel.id);

    if (storedMessageId) {
      try {
        const message = await channel.messages.fetch(storedMessageId);
        await message.edit(editPayload);
        return;
      } catch (error) {
        this.logger.warn(
          { channelId: channel.id, messageId: storedMessageId, err: error },
          'No se pudo actualizar el panel existente, se enviará uno nuevo.',
        );
        tradePanelStore.delete(channel.id);
      }
    }

    const message = await channel.send(sendPayload);
    tradePanelStore.set(channel.id, message.id);
  }
}



