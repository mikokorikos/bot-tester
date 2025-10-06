import type { PrismaClient } from '@prisma/client';
import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
  MessageFlags,
  type TextChannel,
  type User,
} from 'discord.js';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClaimTradeUseCase } from '@/application/usecases/middleman/ClaimTradeUseCase';
import { CloseTradeUseCase } from '@/application/usecases/middleman/CloseTradeUseCase';
import { ConfirmFinalizationUseCase } from '@/application/usecases/middleman/ConfirmFinalizationUseCase';
import { ConfirmTradeUseCase } from '@/application/usecases/middleman/ConfirmTradeUseCase';
import { OpenMiddlemanChannelUseCase } from '@/application/usecases/middleman/OpenMiddlemanChannelUseCase';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { RevokeFinalizationUseCase } from '@/application/usecases/middleman/RevokeFinalizationUseCase';
import { SubmitReviewUseCase } from '@/application/usecases/middleman/SubmitReviewUseCase';
import { SubmitTradeDataUseCase } from '@/application/usecases/middleman/SubmitTradeDataUseCase';
import { GetMemberStatsUseCase } from '@/application/usecases/stats/GetMemberStatsUseCase';
import { OpenSupportTicketUseCase } from '@/application/usecases/tickets/OpenSupportTicketUseCase';
import { AddWarnUseCase } from '@/application/usecases/warn/AddWarnUseCase';
import { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import { Review } from '@/domain/entities/Review';
import { Ticket } from '@/domain/entities/Ticket';
import { Trade } from '@/domain/entities/Trade';
import { TicketStatus, TicketType, type TradeItem } from '@/domain/entities/types';
import { Warn, WarnSeverity } from '@/domain/entities/Warn';
import type { IMemberStatsRepository } from '@/domain/repositories/IMemberStatsRepository';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type {
  IMiddlemanRepository,
  MiddlemanClaim,
  MiddlemanProfile,
} from '@/domain/repositories/IMiddlemanRepository';
import type { IReviewRepository } from '@/domain/repositories/IReviewRepository';
import type {
  ITicketRepository,
  TicketParticipantInput,
} from '@/domain/repositories/ITicketRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import type { IWarnRepository } from '@/domain/repositories/IWarnRepository';
import type { Rating } from '@/domain/value-objects/Rating';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import { memberCardGenerator } from '@/infrastructure/external/MemberCardGenerator';
import { middlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COLORS } from '@/shared/config/constants';

interface StepLog {
  readonly index: number;
  readonly icon: string;
  readonly title: string;
  readonly next: string;
  status?: 'OK' | 'WARN' | 'ERROR';
  detail?: string;
}

class SimulationLogger {
  private readonly steps: StepLog[] = [];
  private current: StepLog | null = null;

  public constructor(private readonly total: number) {}

  public begin(icon: string, title: string, next: string): void {
    if (this.current) {
      throw new Error('Paso previo no finalizado');
    }

    const step: StepLog = {
      index: this.steps.length + 1,
      icon,
      title,
      next,
    };

    this.steps.push(step);
    this.current = step;
    console.log(`[${step.index}/${this.total}] ${icon} ${title} — siguiente: ${next}`);
  }

  public complete(detail: string, status: StepLog['status'] = 'OK'): void {
    if (!this.current) {
      throw new Error('No hay paso activo');
    }

    this.current.status = status;
    this.current.detail = detail;
    const icon = status === 'ERROR' ? '❌' : status === 'WARN' ? '⚠️' : '✅';
    console.log(`  ${icon} ${this.current.title} → ${detail}`);
    this.current = null;
  }

  public summary(): void {
    console.log('\nResumen de flujo:');
    for (const step of this.steps) {
      const icon = step.status === 'ERROR' ? '❌' : step.status === 'WARN' ? '⚠️' : '✅';
      const detail = step.detail ? ` — ${step.detail}` : '';
      console.log(`  ${icon} [${step.index}/${this.total}] ${step.title}${detail}`);
    }
  }
}

interface EmbedValidationResult {
  readonly channelId: string;
  readonly messageId: string;
  readonly context: string;
  readonly embedIndex: number;
}

class SimulatedMessage {
  public constructor(
    public readonly id: string,
    private readonly channel: SimulatedTextChannel,
    private payload: MessageCreateOptions | MessageEditOptions | InteractionReplyOptions,
  ) {}

  public get data(): MessageCreateOptions | MessageEditOptions | InteractionReplyOptions {
    return this.payload;
  }

  public async edit(payload: MessageEditOptions | InteractionReplyOptions): Promise<void> {
    this.channel.validatePayload(payload, `edit#${this.id}`);
    this.payload = payload;
    this.channel.updateMessage(this.id, payload);
  }
}

class SimulatedTextChannel {
  public readonly messages: { fetch: (id: string) => Promise<SimulatedMessage> };
  private readonly storedMessages = new Map<string, SimulatedMessage>();
  private counter = 0n;

  public readonly permissionOverwrites = {
    edit: async (id: string, permissions: Record<string, boolean>): Promise<void> => {
      this.permissionAudit.push({ id, permissions });
    },
  };

  public readonly permissionAudit: Array<{ id: string; permissions: Record<string, boolean> }> = [];

  private readonly api = {
    fetch: async (id: string): Promise<SimulatedMessage> => {
      const message = this.storedMessages.get(id);
      if (!message) {
        throw new Error(`Mensaje ${id} no encontrado en canal ${this.id}`);
      }
      return message;
    },
  };

  public constructor(
    public readonly id: string,
    public name: string,
    private readonly guild: SimulatedGuild,
    private readonly embedLog: EmbedValidationResult[],
  ) {
    this.messages = this.api;
  }

  public async send(
    payload: MessageCreateOptions | InteractionReplyOptions,
  ): Promise<SimulatedMessage> {
    this.validatePayload(payload, 'send');
    const id = (++this.counter).toString();
    const message = new SimulatedMessage(id, this, payload);
    this.storedMessages.set(id, message);
    return message;
  }

  public validatePayload(
    payload: MessageCreateOptions | MessageEditOptions | InteractionReplyOptions,
    context: string,
  ): void {
    if ('flags' in payload && payload.flags === MessageFlags.Ephemeral) {
      throw new Error(`Los mensajes persistentes no pueden ser ephemerals (${this.id}).`);
    }

    const embeds = payload.embeds ?? [];
    if (!embeds.length) {
      throw new Error(`El mensaje ${context} en ${this.id} no contiene embeds.`);
    }

    embeds.forEach((embed, index) => {
      const data = embed instanceof EmbedBuilder ? embed.data : embed;
      if (typeof data.color !== 'number') {
        throw new Error(`Embed sin color en ${context} (${this.id}).`);
      }
      if (!data.author?.name) {
        throw new Error(`Embed sin autor en ${context} (${this.id}).`);
      }
      if (!data.footer?.text) {
        throw new Error(`Embed sin footer en ${context} (${this.id}).`);
      }
      if (!data.timestamp) {
        throw new Error(`Embed sin timestamp en ${context} (${this.id}).`);
      }
      if (!Object.values(COLORS).includes(data.color)) {
        throw new Error(`Color ${data.color} fuera de paleta en ${context} (${this.id}).`);
      }
      this.embedLog.push({ channelId: this.id, messageId: context, context, embedIndex: index });
    });

    if (payload.components && payload.components.length > 5) {
      throw new Error(`Demasiados componentes en ${context} (${this.id}).`);
    }
  }

  public updateMessage(id: string, payload: MessageEditOptions | InteractionReplyOptions): void {
    this.storedMessages.set(id, new SimulatedMessage(id, this, payload));
  }

  public async delete(_reason?: string): Promise<void> {
    this.guild.removeChannel(this.id);
  }

  public toTextChannel(): TextChannel {
    return this as unknown as TextChannel;
  }

  public toString(): string {
    return `<#${this.id}>`;
  }
}

const buildUser = (options: {
  readonly id: string;
  readonly username: string;
  readonly discriminator?: string;
  readonly bot?: boolean;
  readonly globalName?: string | null;
}): User =>
  ({
    id: options.id,
    username: options.username,
    discriminator: options.discriminator ?? '0000',
    bot: options.bot ?? false,
    avatar: null,
    globalName: options.globalName ?? null,
    tag: `${options.username}#${options.discriminator ?? '0000'}`,
  } as unknown as User);

class SimulatedGuildMember {
  public readonly user: User;
  public readonly roles: { cache: { map: <T>(callback: (role: { id: string }) => T) => T[] } };
  public readonly guild: Guild;
  public readonly nickname: string | null;
  public readonly joinedAt: Date | null;

  public constructor(
    private readonly guildRef: SimulatedGuild,
    public readonly id: string,
    username: string,
    public readonly displayName: string,
    options: { roles?: readonly string[]; bot?: boolean } = {},
  ) {
    this.user = buildUser({ id, username, bot: options.bot ?? false });
    this.guild = guildRef.asGuild();
    this.nickname = null;
    this.joinedAt = new Date('2024-01-01T00:00:00.000Z');
    const roleIds = options.roles ? [...options.roles] : [];
    this.roles = {
      cache: {
        map: <T>(callback: (role: { id: string }) => T) => roleIds.map((roleId) => callback({ id: roleId })),
      },
    };
  }

  public asGuildMember(): GuildMember {
    return this as unknown as GuildMember;
  }
}

class SimulatedGuild {
  private readonly channelsMap = new Map<string, SimulatedTextChannel>();
  private readonly membersMap = new Map<string, SimulatedGuildMember>();
  private channelCounter = 5000;
  private readonly guildRef: Guild;

  public readonly roles = { everyone: { id: 'role-everyone' } };
  public readonly members: {
    me: GuildMember | null;
    fetch: (id: string) => Promise<GuildMember>;
  };

  public readonly channels: {
    create: (
      options: {
        name: string;
        type?: ChannelType;
        parent?: string;
        permissionOverwrites?: unknown;
        topic?: string | null;
      },
    ) => Promise<TextChannel>;
  };

  public constructor(
    public readonly id: string,
    private readonly embedLog: EmbedValidationResult[],
  ) {
    this.guildRef = this as unknown as Guild;
    this.members = {
      me: null,
      fetch: async (memberId: string) => {
        const member = this.membersMap.get(memberId);
        if (!member) {
          throw new Error(`Miembro ${memberId} no encontrado`);
        }
        return member.asGuildMember();
      },
    };

    this.channels = {
      create: async ({ name }) => {
        const id = String(++this.channelCounter);
        const channel = new SimulatedTextChannel(id, name, this, this.embedLog);
        this.channelsMap.set(id, channel);
        return channel.toTextChannel();
      },
    };
  }

  public registerMember(member: SimulatedGuildMember): void {
    this.membersMap.set(member.id, member);
  }

  public setBotMember(member: SimulatedGuildMember): void {
    this.registerMember(member);
    this.members.me = member.asGuildMember();
  }

  public getMember(id: string): SimulatedGuildMember | null {
    return this.membersMap.get(id) ?? null;
  }

  public resolveChannel(id: string): SimulatedTextChannel | null {
    return this.channelsMap.get(id) ?? null;
  }

  public removeChannel(id: string): void {
    this.channelsMap.delete(id);
  }

  public asGuild(): Guild {
    return this.guildRef;
  }
}

class FakeLogger implements Logger {
  public level = 'silent';

  public child(): Logger {
    return this;
  }

  public fatal = vi.fn();
  public error = vi.fn();
  public warn = vi.fn();
  public info = vi.fn();
  public debug = vi.fn();
  public trace = vi.fn();
}

class InMemoryTicketRepository implements ITicketRepository {
  private readonly tickets = new Map<number, Ticket>();
  private readonly participants = new Map<number, TicketParticipantInput[]>();
  private sequence = 0;

  public withTransaction(): ITicketRepository {
    return this;
  }

  public async create(data: {
    readonly guildId: bigint;
    readonly channelId: bigint;
    readonly ownerId: bigint;
    readonly type: TicketType;
    readonly status?: TicketStatus;
    readonly participants?: ReadonlyArray<TicketParticipantInput>;
  }): Promise<Ticket> {
    const ticket = new Ticket(
      ++this.sequence,
      data.guildId,
      data.channelId,
      data.ownerId,
      data.type,
      data.status ?? TicketStatus.OPEN,
      new Date(),
    );

    this.tickets.set(ticket.id, ticket);
    this.participants.set(ticket.id, [...(data.participants ?? [])]);
    return ticket;
  }

  public async findById(id: number): Promise<Ticket | null> {
    return this.tickets.get(id) ?? null;
  }

  public async findByChannelId(channelId: bigint): Promise<Ticket | null> {
    for (const ticket of this.tickets.values()) {
      if (ticket.channelId === channelId) {
        return ticket;
      }
    }

    return null;
  }

  public async findOpenByOwner(ownerId: bigint): Promise<readonly Ticket[]> {
    return Array.from(this.tickets.values()).filter(
      (ticket) => ticket.ownerId === ownerId && ticket.status !== TicketStatus.CLOSED,
    );
  }

  public async update(ticket: Ticket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
  }

  public async delete(id: number): Promise<void> {
    this.tickets.delete(id);
    this.participants.delete(id);
  }

  public async countOpenByOwner(ownerId: bigint): Promise<number> {
    return (await this.findOpenByOwner(ownerId)).length;
  }

  public async isParticipant(ticketId: number, userId: bigint): Promise<boolean> {
    const entries = this.participants.get(ticketId) ?? [];
    return entries.some((entry) => entry.userId === userId);
  }

  public async listParticipants(ticketId: number): Promise<readonly TicketParticipantInput[]> {
    return [...(this.participants.get(ticketId) ?? [])];
  }
}

class InMemoryTradeRepository implements ITradeRepository {
  private readonly trades = new Map<number, Trade>();
  private sequence = 0;

  public withTransaction(): ITradeRepository {
    return this;
  }

  public async create(data: {
    readonly ticketId: number;
    readonly userId: bigint;
    readonly robloxUsername: string;
    readonly robloxUserId?: bigint | null;
    readonly status?: TradeStatus;
    readonly confirmed?: boolean;
    readonly items?: ReadonlyArray<TradeItem>;
    readonly userSnapshot?: unknown;
  }): Promise<Trade> {
    const trade = new Trade(
      ++this.sequence,
      data.ticketId,
      data.userId,
      data.robloxUsername,
      data.robloxUserId ?? null,
      null,
      data.status ?? TradeStatus.PENDING,
      data.confirmed ?? false,
      data.items ? [...data.items] : [],
      new Date(),
    );

    this.trades.set(trade.id, trade);
    return trade;
  }

  public async findById(id: number): Promise<Trade | null> {
    return this.trades.get(id) ?? null;
  }

  public async findByTicketId(ticketId: number): Promise<readonly Trade[]> {
    return Array.from(this.trades.values()).filter((trade) => trade.ticketId === ticketId);
  }

  public async findByUserId(userId: bigint): Promise<readonly Trade[]> {
    return Array.from(this.trades.values()).filter((trade) => trade.userId === userId);
  }

  public async update(trade: Trade): Promise<void> {
    this.trades.set(trade.id, trade);
  }

  public async delete(id: number): Promise<void> {
    this.trades.delete(id);
  }
}

class InMemoryMiddlemanRepository implements IMiddlemanRepository {
  private readonly claims = new Map<number, MiddlemanClaim>();
  private readonly middlemen = new Set<bigint>();
  private readonly profiles = new Map<bigint, MiddlemanProfile>();
  private identitySequence = 0;

  public constructor(initialMiddlemen: ReadonlyArray<bigint>) {
    initialMiddlemen.forEach((id) => this.middlemen.add(id));
  }

  public withTransaction(): IMiddlemanRepository {
    return this;
  }

  public addProfile(userId: bigint, profile: MiddlemanProfile): void {
    this.profiles.set(userId, profile);
  }

  public async isMiddleman(userId: bigint): Promise<boolean> {
    return this.middlemen.has(userId);
  }

  public async getClaimByTicket(ticketId: number): Promise<MiddlemanClaim | null> {
    return this.claims.get(ticketId) ?? null;
  }

  public async createClaim(ticketId: number, middlemanId: bigint): Promise<void> {
    this.claims.set(ticketId, {
      ticketId,
      middlemanId,
      claimedAt: new Date(),
      reviewRequestedAt: null,
      closedAt: null,
      forcedClose: false,
      panelMessageId: null,
      finalizationMessageId: null,
    });
  }

  public async markClosed(
    ticketId: number,
    payload: { closedAt: Date; forcedClose?: boolean },
  ): Promise<void> {
    const claim = this.claims.get(ticketId);
    if (claim) {
      this.claims.set(ticketId, {
        ...claim,
        closedAt: payload.closedAt,
        forcedClose: payload.forcedClose ?? false,
      });
    }
  }

  public async markReviewRequested(ticketId: number, requestedAt: Date): Promise<void> {
    const claim = this.claims.get(ticketId);
    if (claim) {
      this.claims.set(ticketId, { ...claim, reviewRequestedAt: requestedAt });
    }
  }

  public async setFinalizationMessageId(ticketId: number, messageId: bigint | null): Promise<void> {
    const claim = this.claims.get(ticketId);
    if (claim) {
      this.claims.set(ticketId, { ...claim, finalizationMessageId: messageId });
    }
  }

  public async upsertProfile(data: {
    userId: bigint;
    robloxUsername: string;
    robloxUserId?: bigint | null;
    verified?: boolean;
  }): Promise<void> {
    const existing = this.profiles.get(data.userId);
    const primaryIdentity = {
      id: ++this.identitySequence,
      username: data.robloxUsername,
      robloxUserId: data.robloxUserId ?? null,
      verified: data.verified ?? true,
      lastUsedAt: new Date(),
    };

    if (!existing) {
      this.profiles.set(data.userId, {
        userId: data.userId,
        primaryIdentity,
        vouches: 0,
        ratingSum: 0,
        ratingCount: 0,
      });
      return;
    }

    this.profiles.set(data.userId, {
      ...existing,
      primaryIdentity,
    });
  }

  public async updateProfile(data: {
    userId: bigint;
    robloxUsername?: string | null;
    robloxUserId?: bigint | null;
    verified?: boolean;
  }): Promise<void> {
    const existing = this.profiles.get(data.userId);
    if (!existing) {
      return;
    }

    const identity = existing.primaryIdentity
      ? { ...existing.primaryIdentity }
      : {
          id: ++this.identitySequence,
          username: data.robloxUsername ?? 'Sin registro',
          robloxUserId: data.robloxUserId ?? null,
          verified: data.verified ?? false,
          lastUsedAt: new Date(),
        };

    if (data.robloxUsername !== undefined && data.robloxUsername !== null) {
      identity.username = data.robloxUsername;
    }
    if (data.robloxUserId !== undefined) {
      identity.robloxUserId = data.robloxUserId;
    }
    if (data.verified !== undefined) {
      identity.verified = data.verified;
    }
    identity.lastUsedAt = new Date();

    this.profiles.set(data.userId, { ...existing, primaryIdentity: identity });
  }

  public async getProfile(userId: bigint): Promise<MiddlemanProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  public async listTopProfiles(limit = 5): Promise<readonly MiddlemanProfile[]> {
    return Array.from(this.profiles.values())
      .sort((a, b) => b.ratingSum / Math.max(1, b.ratingCount) - a.ratingSum / Math.max(1, a.ratingCount))
      .slice(0, limit);
  }
}

class InMemoryFinalizationRepository implements IMiddlemanFinalizationRepository {
  private readonly confirmations = new Map<number, Set<bigint>>();

  public withTransaction(): IMiddlemanFinalizationRepository {
    return this;
  }

  public async listByTicket(ticketId: number): Promise<readonly bigint[]> {
    return Array.from(this.confirmations.get(ticketId) ?? []);
  }

  public async confirm(ticketId: number, userId: bigint): Promise<void> {
    const set = this.confirmations.get(ticketId) ?? new Set<bigint>();
    set.add(userId);
    this.confirmations.set(ticketId, set);
  }

  public async revoke(ticketId: number, userId: bigint): Promise<void> {
    const set = this.confirmations.get(ticketId);
    if (set) {
      set.delete(userId);
    }
  }

  public async reset(ticketId: number): Promise<void> {
    this.confirmations.delete(ticketId);
  }
}

class InMemoryMemberStatsRepository implements IMemberStatsRepository {
  private readonly stats = new Map<bigint, MemberTradeStats>();

  public withTransaction(): IMemberStatsRepository {
    return this;
  }

  public async recordCompletedTrade(
    userId: bigint,
    completedAt: Date,
    metadata?: { robloxUsername?: string | null; robloxUserId?: bigint | null; partnerTag?: string | null },
  ): Promise<MemberTradeStats> {
    const existing = this.stats.get(userId) ?? new MemberTradeStats(userId, 0, null, null, null, null, new Date());
    existing.registerTrade(completedAt, {
      robloxUsername: metadata?.robloxUsername ?? undefined,
      robloxUserId: metadata?.robloxUserId ?? undefined,
      partnerTag: metadata?.partnerTag ?? undefined,
    });
    this.stats.set(userId, existing);
    return existing;
  }

  public async getByUserId(userId: bigint): Promise<MemberTradeStats | null> {
    return this.stats.get(userId) ?? null;
  }

  public async topMembers(limit: number): Promise<readonly MemberTradeStats[]> {
    return Array.from(this.stats.values())
      .sort((a, b) => b.tradesCompleted - a.tradesCompleted)
      .slice(0, limit);
  }
}

class InMemoryReviewRepository implements IReviewRepository {
  private readonly reviews = new Map<number, Review>();
  private sequence = 0;

  public withTransaction(): IReviewRepository {
    return this;
  }

  public async create(data: {
    readonly ticketId: number;
    readonly reviewerId: bigint;
    readonly middlemanId: bigint;
    readonly rating: Rating;
    readonly comment?: string | null;
  }): Promise<Review> {
    const review = new Review(
      ++this.sequence,
      data.ticketId,
      data.reviewerId,
      data.middlemanId,
      data.rating,
      data.comment ?? null,
      new Date(),
    );
    this.reviews.set(review.id, review);
    return review;
  }

  public async findByTicketId(ticketId: number): Promise<readonly Review[]> {
    return Array.from(this.reviews.values()).filter((review) => review.ticketId === ticketId);
  }

  public async findByMiddlemanId(middlemanId: bigint): Promise<readonly Review[]> {
    return Array.from(this.reviews.values()).filter((review) => review.middlemanId === middlemanId);
  }

  public async existsForTicketAndReviewer(ticketId: number, reviewerId: bigint): Promise<boolean> {
    return Array.from(this.reviews.values()).some(
      (review) => review.ticketId === ticketId && review.reviewerId === reviewerId,
    );
  }

  public async calculateAverageRating(middlemanId: bigint): Promise<number> {
    const reviews = await this.findByMiddlemanId(middlemanId);
    if (reviews.length === 0) {
      return 0;
    }

    const total = reviews.reduce((acc, review) => acc + review.rating.getValue(), 0);
    return total / reviews.length;
  }
}

class InMemoryWarnRepository implements IWarnRepository {
  private readonly warns = new Map<number, Warn>();
  private readonly byUser = new Map<bigint, Warn[]>();
  private sequence = 0;

  public withTransaction(): IWarnRepository {
    return this;
  }

  public async create(data: {
    readonly userId: bigint;
    readonly moderatorId?: bigint | null;
    readonly severity: WarnSeverity;
    readonly reason?: string | null;
  }): Promise<Warn> {
    const warn = new Warn(
      ++this.sequence,
      data.userId,
      data.moderatorId ?? null,
      data.severity,
      data.reason ?? null,
      new Date(),
    );
    this.warns.set(warn.id, warn);
    const entries = this.byUser.get(data.userId) ?? [];
    entries.push(warn);
    this.byUser.set(data.userId, entries);
    return warn;
  }

  public async listByUser(userId: bigint): Promise<readonly Warn[]> {
    return [...(this.byUser.get(userId) ?? [])];
  }

  public async remove(id: number): Promise<void> {
    const warn = this.warns.get(id);
    if (!warn) {
      return;
    }
    this.warns.delete(id);
    const entries = this.byUser.get(warn.userId.valueOf());
    if (entries) {
      this.byUser.set(
        warn.userId.valueOf(),
        entries.filter((current) => current.id !== id),
      );
    }
  }

  public async getSummary(userId: bigint): Promise<{
    readonly total: number;
    readonly weightedScore: number;
    readonly lastWarnAt: Date | null;
  }> {
    const entries = this.byUser.get(userId) ?? [];
    const total = entries.length;
    const weightedScore = entries.reduce((acc, current) => acc + current.weight, 0);
    const lastWarnAt = entries.reduce<Date | null>((acc, current) => {
      if (!acc || current.createdAt > acc) {
        return current.createdAt;
      }
      return acc;
    }, null);

    return { total, weightedScore, lastWarnAt };
  }
}

class FakePrismaClient {
  public async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn({});
  }
}

const createMockAttachment = (name: string): AttachmentBuilder =>
  new AttachmentBuilder(Buffer.from(name, 'utf8'), { name });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Simulación integral del bot', () => {
  it('ejecuta el flujo completo de un trade con middleman', async () => {
    const embedLog: EmbedValidationResult[] = [];
    const logger = new SimulationLogger(16);
    const fakeLogger = new FakeLogger();

    vi.spyOn(middlemanCardGenerator, 'renderTradeSummaryCard').mockResolvedValue(
      createMockAttachment('trade-card.gif'),
    );
    vi.spyOn(middlemanCardGenerator, 'renderProfileCard').mockResolvedValue(
      createMockAttachment('profile-card.gif'),
    );
    vi.spyOn(middlemanCardGenerator, 'renderStatsCard').mockResolvedValue(
      createMockAttachment('stats-card.gif'),
    );
    vi.spyOn(memberCardGenerator, 'render').mockResolvedValue(createMockAttachment('member-card.png'));

    const ticketRepo = new InMemoryTicketRepository();
    const tradeRepo = new InMemoryTradeRepository();
    const middlemanRepo = new InMemoryMiddlemanRepository([BigInt('333333333333333333')]);
    const finalizationRepo = new InMemoryFinalizationRepository();
    const statsRepo = new InMemoryMemberStatsRepository();
    const reviewRepo = new InMemoryReviewRepository();
    const warnRepo = new InMemoryWarnRepository();
    const prisma = new FakePrismaClient() as unknown as PrismaClient;

    const guild = new SimulatedGuild('111111111111111111', embedLog);
    const ownerMember = new SimulatedGuildMember(guild, '222222222222222222', 'owner', 'Trader Owner');
    const partnerMember = new SimulatedGuildMember(guild, '444444444444444444', 'partner', 'Trader Partner');
    const middlemanMember = new SimulatedGuildMember(
      guild,
      '333333333333333333',
      'middleman',
      'Trusted Middleman',
      { roles: ['role-middleman'] },
    );
    const staffMember = new SimulatedGuildMember(
      guild,
      '555555555555555555',
      'staff',
      'Staff Hero',
      { roles: ['role-staff'] },
    );
    const botMember = new SimulatedGuildMember(
      guild,
      '999999999999999999',
      'dedos-bot',
      'Dedos Bot',
      { bot: true },
    );

    guild.registerMember(ownerMember);
    guild.registerMember(partnerMember);
    guild.registerMember(middlemanMember);
    guild.registerMember(staffMember);
    guild.setBotMember(botMember);

    middlemanRepo.addProfile(BigInt('333333333333333333'), {
      userId: BigInt('333333333333333333'),
      primaryIdentity: {
        id: 1,
        username: 'MiddlemanPro',
        robloxUserId: BigInt('777777777777777777'),
        verified: true,
        lastUsedAt: new Date(),
      },
      vouches: 25,
      ratingSum: 22,
      ratingCount: 5,
    });

    const supportTicketUseCase = new OpenSupportTicketUseCase(ticketRepo, fakeLogger, {
      categoryId: 'support-category',
      staffRoleIds: ['role-staff'],
      maxTicketsPerUser: 3,
      cooldownMs: 0,
    });
    const transactions = {
      $transaction: async <T>(fn: (context: unknown) => Promise<T>): Promise<T> => fn({}),
    };

    const openMiddlemanUseCase = new OpenMiddlemanChannelUseCase(ticketRepo, transactions, fakeLogger, embedFactory);
    const claimTradeUseCase = new ClaimTradeUseCase(ticketRepo, middlemanRepo, fakeLogger, embedFactory);
    const submitTradeDataUseCase = new SubmitTradeDataUseCase(ticketRepo, tradeRepo, fakeLogger);
    const confirmTradeUseCase = new ConfirmTradeUseCase(ticketRepo, tradeRepo, fakeLogger);
    const requestClosureUseCase = new RequestTradeClosureUseCase(
      ticketRepo,
      finalizationRepo,
      middlemanRepo,
      embedFactory,
      fakeLogger,
    );
    const confirmFinalizationUseCase = new ConfirmFinalizationUseCase(
      ticketRepo,
      finalizationRepo,
      middlemanRepo,
      embedFactory,
      fakeLogger,
    );
    const revokeFinalizationUseCase = new RevokeFinalizationUseCase(
      ticketRepo,
      finalizationRepo,
      middlemanRepo,
      embedFactory,
      fakeLogger,
    );
    const closeTradeUseCase = new CloseTradeUseCase(
      ticketRepo,
      tradeRepo,
      statsRepo,
      middlemanRepo,
      finalizationRepo,
      prisma,
      fakeLogger,
      embedFactory,
    );
    const submitReviewUseCase = new SubmitReviewUseCase(reviewRepo, ticketRepo, middlemanRepo, embedFactory, fakeLogger);
    const addWarnUseCase = new AddWarnUseCase(warnRepo, fakeLogger);
    const getStatsUseCase = new GetMemberStatsUseCase(statsRepo);

    logger.begin('🧪', 'Inicialización de entorno', 'Creación de ticket de soporte');
    const { channel: supportChannel } = await supportTicketUseCase.execute({
      guild: guild.asGuild(),
      member: ownerMember.asGuildMember(),
      type: TicketType.BUY,
      reason: 'Necesito ayuda con un producto.',
    });
    expect(supportChannel).toBeDefined();
    logger.complete('Ticket de soporte generado');

    logger.begin('🟣', 'Creación de ticket middleman', 'Asignación de middleman');
    const { ticket, channel } = await openMiddlemanUseCase.execute(
      {
        userId: ownerMember.id,
        guildId: guild.id,
        type: 'MM',
        context: 'Trade de items exclusivos.',
        partnerTag: `<@${partnerMember.id}>`,
        categoryId: '888888888888888888',
      },
      guild.asGuild(),
    );
    expect(ticket.status).toBe(TicketStatus.OPEN);
    const mmChannel = guild.resolveChannel(channel.id);
    expect(mmChannel).not.toBeNull();
    logger.complete(`Ticket #${ticket.id} abierto en ${channel.id}`);

    logger.begin('🛡️', 'Reclamación de middleman', 'Registro de datos de trade');
    await claimTradeUseCase.execute(
      {
        ticketId: ticket.id,
        middlemanId: middlemanMember.id,
      },
      channel,
    );
    expect(ticket.status).toBe(TicketStatus.CLAIMED);
    expect(mmChannel?.permissionAudit.some((entry) => entry.id === middlemanMember.id)).toBe(true);
    logger.complete('Middleman habilitado y con acceso al canal');

    logger.begin('🧾', 'Registro de datos del propietario', 'Registro de datos del socio');
    const ownerTrade = await submitTradeDataUseCase.execute({
      ticketId: ticket.id,
      userId: ownerMember.id,
      robloxUsername: 'OwnerRBX',
      offerDescription: 'Item legendario nivel 5',
    });
    expect(ownerTrade.userId.toString()).toBe(ownerMember.id);
    logger.complete('Datos del propietario almacenados');

    logger.begin('🧾', 'Registro de datos del socio', 'Confirmaciones de trade');
    const partnerTrade = await submitTradeDataUseCase.execute({
      ticketId: ticket.id,
      userId: partnerMember.id,
      robloxUsername: 'PartnerRBX',
      offerDescription: 'Diamantes x500',
    });
    expect(partnerTrade.userId.toString()).toBe(partnerMember.id);
    logger.complete('Datos del socio almacenados');

    logger.begin('✅', 'Confirmación del propietario', 'Confirmación del socio');
    const ownerConfirm = await confirmTradeUseCase.execute({
      ticketId: ticket.id,
      userId: ownerMember.id,
    });
    expect(ownerConfirm.ticketConfirmed).toBe(false);
    expect(ticket.status).toBe(TicketStatus.CLAIMED);
    logger.complete('Propietario listo');

    logger.begin('✅', 'Confirmación del socio', 'Solicitud de cierre');
    const partnerConfirm = await confirmTradeUseCase.execute({
      ticketId: ticket.id,
      userId: partnerMember.id,
    });
    expect(partnerConfirm.ticketConfirmed).toBe(true);
    expect(ticket.status).toBe(TicketStatus.CONFIRMED);
    logger.complete('Socio confirmó y ticket quedó listo');

    logger.begin('📨', 'Solicitud de cierre', 'Confirmación de finalización');
    const closureRequest = await requestClosureUseCase.execute(
      ticket.id,
      BigInt(middlemanMember.id),
      channel,
    );
    expect(closureRequest.participantCount).toBe(2);
    logger.complete('Panel de finalización publicado');

    logger.begin('🧩', 'Confirmación del propietario', 'Revocación de confirmación');
    const ownerFinalization = await confirmFinalizationUseCase.execute(
      ticket.id,
      BigInt(ownerMember.id),
      channel,
    );
    expect(ownerFinalization.alreadyConfirmed).toBe(false);
    expect(ownerFinalization.completed).toBe(false);
    logger.complete('Propietario confirmó finalización');

    logger.begin('↩️', 'Revocación del propietario', 'Reconfirmación del propietario');
    const revokeResult = await revokeFinalizationUseCase.execute(
      ticket.id,
      BigInt(ownerMember.id),
      channel,
    );
    expect(revokeResult.previouslyConfirmed).toBe(true);
    logger.complete('Confirmación retirada para validar flujo de reversión');

    logger.begin('🧩', 'Reconfirmación del propietario', 'Confirmación del socio');
    const ownerReconfirm = await confirmFinalizationUseCase.execute(
      ticket.id,
      BigInt(ownerMember.id),
      channel,
    );
    expect(ownerReconfirm.completed).toBe(false);
    logger.complete('Propietario volvió a confirmar');

    logger.begin('🧩', 'Confirmación del socio', 'Cierre del middleman');
    const partnerFinalization = await confirmFinalizationUseCase.execute(
      ticket.id,
      BigInt(partnerMember.id),
      channel,
    );
    expect(partnerFinalization.completed).toBe(true);
    logger.complete('Todos los traders confirmaron finalización');

    logger.begin('🚪', 'Cierre del trade', 'Publicación de reseña');
    await closeTradeUseCase.execute(ticket.id, BigInt(middlemanMember.id), channel);
    expect(ticket.status).toBe(TicketStatus.CLOSED);
    const finalizationsAfterClose = await finalizationRepo.listByTicket(ticket.id);
    expect(finalizationsAfterClose.length).toBe(0);
    const claim = await middlemanRepo.getClaimByTicket(ticket.id);
    expect(claim?.closedAt).toBeInstanceOf(Date);
    logger.complete('Ticket cerrado y estadísticas actualizadas');

    logger.begin('📝', 'Publicación de reseña', 'Registro de advertencia');
    const reviewsChannel = await guild.channels.create({ name: 'reseñas', type: ChannelType.GuildText });
    await submitReviewUseCase.execute(
      {
        ticketId: ticket.id,
        reviewerId: ownerMember.id,
        middlemanId: middlemanMember.id,
        rating: 5,
        comment: 'Excelente servicio y comunicación.',
      },
      reviewsChannel,
    );
    const reviews = await reviewRepo.findByTicketId(ticket.id);
    expect(reviews).toHaveLength(1);
    logger.complete('Reseña registrada en canal de reseñas');

    logger.begin('⚠️', 'Registro de advertencia', 'Consulta de estadísticas');
    const warnResult = await addWarnUseCase.execute({
      userId: partnerMember.id,
      moderatorId: staffMember.id,
      severity: WarnSeverity.MINOR,
      reason: 'Retraso en la confirmación',
    });
    expect(warnResult.summary.totalPoints).toBeGreaterThan(0);
    logger.complete('Advertencia almacenada y resumida');

    logger.begin('📊', 'Consulta de estadísticas', 'Resumen final');
    const statsResult = await getStatsUseCase.execute(BigInt(middlemanMember.id));
    expect(statsResult.stats.tradesCompleted).toBe(1);
    expect(statsResult.leaderboard).toHaveLength(1);
    logger.complete('Estadísticas consultadas correctamente');

    logger.summary();

    expect(embedLog.length).toBeGreaterThan(0);
  });
});
