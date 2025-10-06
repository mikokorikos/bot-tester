// ============================================================================
// RUTA: src/application/usecases/middleman/CloseTradeUseCase.ts
// ============================================================================

import type { Prisma, PrismaClient } from '@prisma/client';
import type { TextChannel } from 'discord.js';
import type { Logger } from 'pino';

import type { FinalizationParticipantPresentation } from '@/application/services/FinalizationPanelService';
import { renderFinalizationPanel } from '@/application/services/FinalizationPanelService';
import { reviewInviteStore } from '@/application/services/ReviewInviteStore';
import type { IMemberStatsRepository } from '@/domain/repositories/IMemberStatsRepository';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository, TicketParticipantInput } from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { FINALIZATION_CANCEL_BUTTON_ID } from '@/presentation/components/buttons/FinalizationCancelButton';
import { FINALIZATION_CONFIRM_BUTTON_ID } from '@/presentation/components/buttons/FinalizationConfirmButton';
import { buildReviewButtonRow } from '@/presentation/components/buttons/ReviewButtons';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import {
  FinalizationPendingError,
  TicketClosedError,
  TicketNotFoundError,
  TradesNotConfirmedError,
  UnauthorizedActionError,
} from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';

export class CloseTradeUseCase {
  public constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly tradeRepo: ITradeRepository,
    private readonly statsRepo: IMemberStatsRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly finalizationRepo: IMiddlemanFinalizationRepository,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    private readonly embeds: EmbedFactory = embedFactory,
  ) {}

  public async execute(
    ticketId: number,
    middlemanId: bigint,
    channel: TextChannel,
  ): Promise<void> {
    const ticket = await this.ticketRepo.findById(ticketId);

    if (!ticket) {
      throw new TicketNotFoundError(String(ticketId));
    }

    if (ticket.isClosed()) {
      throw new TicketClosedError(ticketId);
    }

    const claim = await this.middlemanRepo.getClaimByTicket(ticketId);
    if (!claim || claim.middlemanId !== middlemanId) {
      throw new UnauthorizedActionError('middleman:close');
    }

    const trades = await this.tradeRepo.findByTicketId(ticketId);
    if (trades.some((trade) => !trade.confirmed)) {
      throw new TradesNotConfirmedError(ticketId);
    }
    const ticketParticipants = await this.ticketRepo.listParticipants(ticket.id);
    const { traderIds, presentation } = await this.buildFinalizationParticipants(channel, ticket.ownerId, ticketParticipants);
    const finalizations = new Set(await this.finalizationRepo.listByTicket(ticket.id));

    if (traderIds.size > 1 && !this.allFinalizationsConfirmed(traderIds, finalizations)) {
      await renderFinalizationPanel({
        channel,
        claim,
        participants: presentation,
        confirmedIds: finalizations,
        completed: false,
        embedFactory: this.embeds,
        middlemanRepo: this.middlemanRepo,
        logger: this.logger,
        confirmButtonId: FINALIZATION_CONFIRM_BUTTON_ID,
        cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
      });

      throw new FinalizationPendingError(ticketId);
    }

    const completedAt = new Date();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transactionalTicketRepo = this.ticketRepo.withTransaction(tx);
      const transactionalTradeRepo = this.tradeRepo.withTransaction(tx);
      const transactionalStatsRepo = this.statsRepo.withTransaction(tx);
      const transactionalMiddlemanRepo = this.middlemanRepo.withTransaction(tx);

      for (const trade of trades) {
        if (trade.status === TradeStatus.PENDING) {
          trade.confirm();
        }

        if (!trade.canBeCompleted()) {
          throw new TradesNotConfirmedError(ticketId);
        }

        trade.complete();
        await transactionalTradeRepo.update(trade);
      }

      ticket.close();
      await transactionalTicketRepo.update(ticket);
      await transactionalMiddlemanRepo.markClosed(ticketId, { closedAt: completedAt });
      await transactionalStatsRepo.recordCompletedTrade(middlemanId, completedAt);
    });

    if (traderIds.size > 0) {
      await renderFinalizationPanel({
        channel,
        claim,
        participants: presentation,
        confirmedIds: finalizations,
        completed: true,
        embedFactory: this.embeds,
        middlemanRepo: this.middlemanRepo,
        logger: this.logger,
        confirmButtonId: FINALIZATION_CONFIRM_BUTTON_ID,
        cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
      });

      await this.finalizationRepo.reset(ticketId);
    }

    const reviewMessage = await channel.send(
      brandMessageOptions({
        embeds: [
          this.embeds.success({
            title: 'Ticket cerrado',
            description:
              'La transacción fue marcada como completada. Gracias por utilizar el sistema de middleman de Dedos.',
          }),
          this.embeds.reviewRequest({
            middlemanTag: `<@${middlemanId}>`,
            tradeSummary: 'Por favor comparte tu experiencia respondiendo al formulario de reseña.',
          }),
        ],
        components: [
          buildReviewButtonRow({ ticketId, middlemanId: middlemanId.toString() }),
        ],
      }),
    );

    reviewInviteStore.set(reviewMessage.id, { ticketId, middlemanId: middlemanId.toString() });

    this.logger.info(
      { ticketId, middlemanId: middlemanId.toString(), channelId: channel.id },
      'Ticket de middleman cerrado correctamente.',
    );
  }

  private allFinalizationsConfirmed(traderIds: Set<bigint>, confirmed: ReadonlySet<bigint>): boolean {
    if (traderIds.size <= 1) {
      return true;
    }

    for (const id of traderIds.values()) {
      if (!confirmed.has(id)) {
        return false;
      }
    }

    return true;
  }

  private async buildFinalizationParticipants(
    channel: TextChannel,
    ownerId: bigint,
    participants: ReadonlyArray<TicketParticipantInput>,
  ): Promise<{ traderIds: Set<bigint>; presentation: FinalizationParticipantPresentation[] }> {
    const traderIds = new Set<bigint>();
    traderIds.add(ownerId);

    for (const participant of participants) {
      const role = participant.role?.toUpperCase() ?? null;
      if (!role || role === 'PARTNER' || role === 'OWNER' || role === 'TRADER') {
        traderIds.add(participant.userId);
      }
    }

    const orderedIds: bigint[] = [];
    orderedIds.push(ownerId);

    const remaining = Array.from(traderIds.values()).filter((id) => id !== ownerId);
    remaining.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    orderedIds.push(...remaining);

    const guild = channel.guild;
    const presentation = await Promise.all(
      orderedIds.map(async (id) => {
        const snowflake = id.toString();
        const label = await guild.members
          .fetch(snowflake)
          .then((member) => member.displayName)
          .catch(() => `Usuario ${snowflake}`);

        return { id, label: label ?? `Usuario ${snowflake}` };
      }),
    );

    return { traderIds, presentation };
  }

}



















