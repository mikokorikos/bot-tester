// ============================================================================
// RUTA: src/application/usecases/middleman/SubmitReviewUseCase.ts
// ============================================================================

import type { TextChannel, User } from 'discord.js';
import type { Logger } from 'pino';

import { type SubmitReviewDTO, SubmitReviewSchema } from '@/application/dto/review.dto';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { IReviewRepository } from '@/domain/repositories/IReviewRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { Rating } from '@/domain/value-objects/Rating';
import { middlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { resolveUserBannerUrl } from '@/shared/discord/resolveUserBannerUrl';
import {
  DuplicateReviewError,
  TicketNotFoundError,
  UnauthorizedActionError,
  ValidationFailedError,
} from '@/shared/errors/domain.errors';
import { brandMessageOptions } from '@/shared/utils/branding';

export class SubmitReviewUseCase {
  public constructor(
    private readonly reviewRepo: IReviewRepository,
    private readonly ticketRepo: ITicketRepository,
    private readonly middlemanRepo: IMiddlemanRepository,
    private readonly embeds: EmbedFactory = embedFactory,
    private readonly logger: Logger,
  ) {}

  public async execute(dto: SubmitReviewDTO, reviewsChannel: TextChannel): Promise<void> {
    const payload = SubmitReviewSchema.parse(dto);

    const ticket = await this.ticketRepo.findById(payload.ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(String(payload.ticketId));
    }

    if (!ticket.isClosed()) {
      throw new ValidationFailedError({ ticketId: 'El ticket debe estar cerrado antes de enviar una reseña.' });
    }

    const reviewerId = BigInt(payload.reviewerId);
    const middlemanId = BigInt(payload.middlemanId);

    const participants = await this.ticketRepo.listParticipants(ticket.id);
    const traderIds = new Set<bigint>();
    traderIds.add(ticket.ownerId);

    for (const participant of participants) {
      const role = participant.role?.toUpperCase() ?? null;
      if (!role || role === 'PARTNER' || role === 'OWNER' || role === 'TRADER') {
        traderIds.add(participant.userId);
      }
    }

    if (!traderIds.has(reviewerId)) {
      throw new UnauthorizedActionError('middleman:review');
    }

    const hasReview = await this.reviewRepo.existsForTicketAndReviewer(ticket.id, reviewerId);
    if (hasReview) {
      throw new DuplicateReviewError(String(ticket.id), payload.reviewerId);
    }

    const trimmedComment = payload.comment?.trim() ?? null;

    if (trimmedComment && trimmedComment.length > 500) {
      throw new ValidationFailedError({ comment: 'El comentario no puede superar los 500 caracteres.' });
    }

    const partnerByRole = participants.find((entry) => entry.role?.toUpperCase() === 'PARTNER');
    const partnerCandidate = partnerByRole?.userId ?? participants.find((entry) => entry.userId !== ticket.ownerId)?.userId ?? null;
    const partnerId = partnerCandidate ?? null;
    const ownerTag = `<@${ticket.ownerId.toString()}>`;
    const partnerTag = partnerId ? `<@${partnerId.toString()}>` : null;
    const ratingResult = Rating.create(payload.rating);
    if (ratingResult.isErr()) {
      throw ratingResult.unwrapErr();
    }

    const review = await this.reviewRepo.create({
      ticketId: ticket.id,
      reviewerId,
      middlemanId,
      rating: ratingResult.unwrap(),
      comment: trimmedComment,
    });

    const [averageRating, profile] = await Promise.all([
      this.reviewRepo.calculateAverageRating(middlemanId),
      this.middlemanRepo.getProfile(middlemanId),
    ]);
    const ratingValue = review.rating.getValue();
    const totalReviews = profile?.ratingCount ?? 0;
    const totalVouches = profile?.vouches ?? 0;
    const middlemanMention = `<@${payload.middlemanId}>`;
    let middlemanDisplayName = payload.middlemanDisplayName ?? null;

    let middlemanUser: User | null = null;
    if (!middlemanDisplayName) {
      const guildMember = await reviewsChannel.guild.members
        .fetch(payload.middlemanId)
        .catch(() => null);
      middlemanUser = guildMember?.user ?? null;
      middlemanDisplayName = guildMember?.displayName ?? guildMember?.user.username ?? null;
    }
    if (!middlemanUser) {
      middlemanUser = await reviewsChannel.client.users.fetch(payload.middlemanId).catch(() => null);
    }
    if (
      middlemanUser &&
      typeof middlemanUser.banner === 'undefined' &&
      typeof middlemanUser.fetch === 'function'
    ) {
      middlemanUser = await middlemanUser.fetch().catch(() => middlemanUser);
    }
    const middlemanBannerUrl = resolveUserBannerUrl(middlemanUser) ?? undefined;


    const cardAttachment = await middlemanCardGenerator.renderProfileCard({
      discordTag: middlemanMention,
      discordDisplayName: middlemanDisplayName,
      discordAvatarUrl: payload.middlemanAvatarUrl,
      discordBannerUrl: middlemanBannerUrl,
      profile,
      highlight: `Nueva reseña: ${ratingValue.toFixed(1)} ⭐`,
    });

    const mentionTargets = new Set<string>([payload.middlemanId, payload.reviewerId]);
    mentionTargets.add(ticket.ownerId.toString());
    if (partnerId) {
      mentionTargets.add(partnerId.toString());
    }

    await reviewsChannel.send(
      brandMessageOptions({
        embeds: [
          this.embeds.reviewPublished({
            ticketId: ticket.id,
            middlemanTag: middlemanMention,
            middlemanDisplayName,
            reviewerTag: `<@${payload.reviewerId}>`,
            rating: ratingValue,
            comment: trimmedComment,
            averageRating,
            ownerTag,
            partnerTag: partnerTag ?? undefined,
            vouches: totalVouches,
            reviewsCount: totalReviews,
          }),
        ],
        files: cardAttachment ? [cardAttachment] : [],
        allowedMentions: { users: Array.from(mentionTargets) },
      }),
    );
    this.logger.info(
      {
        ticketId: ticket.id,
        reviewerId: payload.reviewerId,
        middlemanId: payload.middlemanId,
        rating: ratingValue,
      },
      'Reseña registrada exitosamente.',
    );
  }
}














