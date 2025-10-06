// ============================================================================
// RUTA: src/application/usecases/middleman/RequestTradeClosureUseCase.ts
// ============================================================================

import type { TextChannel } from 'discord.js';
import type { Logger } from 'pino';

import type { FinalizationParticipantPresentation } from '@/application/services/FinalizationPanelService';
import { renderFinalizationPanel } from '@/application/services/FinalizationPanelService';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import type { TicketParticipantInput } from '@/domain/repositories/ITicketRepository';
import { FINALIZATION_CANCEL_BUTTON_ID } from '@/presentation/components/buttons/FinalizationCancelButton';
import { FINALIZATION_CONFIRM_BUTTON_ID } from '@/presentation/components/buttons/FinalizationConfirmButton';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  TicketClosedError,
  TicketNotFoundError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';

interface RequestClosureResult {
  readonly completed: boolean;
  readonly alreadyPending: boolean;
  readonly participantCount: number;
}

export class RequestTradeClosureUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly finalizationRepo: IMiddlemanFinalizationRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly embeds: EmbedFactory,
    private readonly logger: Logger,
  ) {}

  public async execute(
    ticketId: number,
    middlemanId: bigint,
    channel: TextChannel,
  ): Promise<RequestClosureResult> {
    const ticket = await this.ticketRepo.findById(ticketId);

    if (!ticket) {
      throw new TicketNotFoundError(String(ticketId));
    }

    if (ticket.isClosed()) {
      throw new TicketClosedError(ticketId);
    }

    const claim = await this.middlemanRepo.getClaimByTicket(ticket.id);
    if (!claim || claim.middlemanId !== middlemanId) {
      throw new UnauthorizedActionError('middleman:close-request');
    }

    const rawParticipants = await this.ticketRepo.listParticipants(ticket.id);
    const traderIds = this.collectTraderIds(ticket.ownerId, rawParticipants);
    const confirmedIds = new Set(await this.finalizationRepo.listByTicket(ticket.id));

    const participantsForPanel = await this.resolveParticipantLabels(channel, traderIds);
    const completed = this.areAllConfirmed(traderIds, confirmedIds);

    await renderFinalizationPanel({
      channel,
      claim,
      participants: participantsForPanel,
      confirmedIds,
      completed,
      embedFactory: this.embeds,
      middlemanRepo: this.middlemanRepo,
      logger: this.logger,
      confirmButtonId: FINALIZATION_CONFIRM_BUTTON_ID,
      cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
    });

    this.logger.info(
      {
        ticketId,
        middlemanId: middlemanId.toString(),
        participantCount: traderIds.size,
        alreadyPending: Boolean(claim.finalizationMessageId),
        completed,
      },
      'Solicitud de cierre de trade procesada.',
    );

    return {
      completed,
      alreadyPending: Boolean(claim.finalizationMessageId),
      participantCount: traderIds.size,
    };
  }

  private collectTraderIds(
    ownerId: bigint,
    participants: ReadonlyArray<TicketParticipantInput>,
  ): Set<bigint> {
    const traderIds = new Set<bigint>([ownerId]);

    for (const participant of participants) {
      const role = participant.role?.toUpperCase() ?? null;
      if (!role || role === 'PARTNER' || role === 'OWNER' || role === 'TRADER') {
        traderIds.add(participant.userId);
      }
    }

    return traderIds;
  }

  private areAllConfirmed(traderIds: Set<bigint>, confirmed: ReadonlySet<bigint>): boolean {
    if (traderIds.size === 0) {
      return false;
    }

    for (const id of traderIds.values()) {
      if (!confirmed.has(id)) {
        return false;
      }
    }

    return true;
  }

  private async resolveParticipantLabels(
    channel: TextChannel,
    traderIds: Set<bigint>,
  ): Promise<FinalizationParticipantPresentation[]> {
    const guild = channel.guild;
    const entries = await Promise.all(
      Array.from(traderIds.values()).map(async (id) => {
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
