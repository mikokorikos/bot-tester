// ============================================================================
// RUTA: src/application/usecases/middleman/ConfirmFinalizationUseCase.ts
// ============================================================================

import type { TextChannel } from 'discord.js';
import { Collection } from 'discord.js';
import type { Logger } from 'pino';

import { renderFinalizationPanel } from '@/application/services/FinalizationPanelService';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { FINALIZATION_CANCEL_BUTTON_ID } from '@/presentation/components/buttons/FinalizationCancelButton';
import { FINALIZATION_CONFIRM_BUTTON_ID } from '@/presentation/components/buttons/FinalizationConfirmButton';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  TicketClosedError,
  TicketNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';

interface ConfirmFinalizationResult {
  readonly alreadyConfirmed: boolean;
  readonly completed: boolean;
}

export class ConfirmFinalizationUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly finalizationRepo: IMiddlemanFinalizationRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly embeds: EmbedFactory,
    private readonly logger: Logger,
  ) {}

  public async execute(
    ticketId: number,
    userId: bigint,
    channel: TextChannel,
  ): Promise<ConfirmFinalizationResult> {
    const ticket = await this.ticketRepo.findById(ticketId);

    if (!ticket) {
      throw new TicketNotFoundError(String(ticketId));
    }

    if (!ticket.isOpen()) {
      throw new TicketClosedError(ticketId);
    }

    const isOwner = ticket.isOwnedBy(userId);
    const isParticipant = isOwner || (await this.ticketRepo.isParticipant(ticket.id, userId));

    if (!isParticipant) {
      throw new UnauthorizedActionError('middleman:finalization:confirm');
    }

    const claim = await this.middlemanRepo.getClaimByTicket(ticket.id);
    if (!claim) {
      throw new UnauthorizedActionError('middleman:finalization:confirm');
    }

    const rawParticipants = await this.ticketRepo.listParticipants(ticket.id);
    const traderIds = new Collection<string, bigint>();
    traderIds.set(ticket.ownerId.toString(), ticket.ownerId);

    for (const participant of rawParticipants) {
      const role = participant.role?.toUpperCase() ?? null;
      if (!role || role === 'PARTNER' || role === 'OWNER' || role === 'TRADER') {
        traderIds.set(participant.userId.toString(), participant.userId);
      }
    }

    if (!traderIds.has(userId.toString())) {
      traderIds.set(userId.toString(), userId);
    }

    const confirmedBefore = new Set(await this.finalizationRepo.listByTicket(ticket.id));
    const alreadyConfirmed = confirmedBefore.has(userId);
    const wasCompleted = this.areAllConfirmed(traderIds, confirmedBefore);

    if (!alreadyConfirmed) {
      await this.finalizationRepo.confirm(ticket.id, userId);
      confirmedBefore.add(userId);
    }

    const completed = this.areAllConfirmed(traderIds, confirmedBefore);

    const participantsForPanel = await this.resolveParticipantLabels(channel, traderIds);

    await renderFinalizationPanel({
      channel,
      claim,
      participants: participantsForPanel,
      confirmedIds: confirmedBefore,
      completed,
      embedFactory: this.embeds,
      middlemanRepo: this.middlemanRepo,
      logger: this.logger,
      confirmButtonId: FINALIZATION_CONFIRM_BUTTON_ID,
      cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
    });

    if (completed && !wasCompleted) {
      const mentionTargets = Array.from(new Set([
        claim.middlemanId.toString(),
        ...participantsForPanel.map((participant) => participant.id.toString()),
      ]));

      const mentionLine = mentionTargets.map((id) => `<@${id}>`).join(' ');
      const completionEmbed = this.embeds.success({
        title: 'Trade confirmado',
        description: [
          'Todos los traders confirmaron el intercambio.',
          mentionLine ? `Notificacion: ${mentionLine}` : null,
          'Un middleman puede cerrar el ticket cuando esten listos.',
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n\n'),
      });

      await channel.send(
        brandMessageOptions(
          {
            embeds: [completionEmbed],
            allowedMentions: { users: mentionTargets },
          },
          { useHeroImage: false },
        ),
      );
    }

    this.logger.info(
      {
        ticketId: ticket.id,
        userId: userId.toString(),
        completed,
        alreadyConfirmed,
      },
      'Confirmacion de finalizacion registrada.',
    );

    return { alreadyConfirmed, completed };
  }

  private areAllConfirmed(
    traderIds: Collection<string, bigint>,
    confirmed: ReadonlySet<bigint>,
  ): boolean {
    for (const id of traderIds.values()) {
      if (!confirmed.has(id)) {
        return false;
      }
    }

    return traderIds.size > 0;
  }

  private async resolveParticipantLabels(
    channel: TextChannel,
    participants: Collection<string, bigint>,
  ) {
    const guild = channel.guild;

    const ids = Array.from(participants.values());
    const entries = await Promise.all(
      ids.map(async (id) => {
        const snowflake = id.toString();
        const label = await guild.members
          .fetch(snowflake)
          .then((member) => member.displayName)
          .catch(() => `Usuario ${snowflake}`);

        return { id, label: label ?? `Usuario ${snowflake}` };
      }),
    );

    return entries;
  }
}
