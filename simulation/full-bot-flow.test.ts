import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EmbedBuilder,
  MessageFlags,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
  type Snowflake,
} from 'discord.js';
import type { Logger } from 'pino';

import { AddWarnUseCase } from '@/application/usecases/warn/AddWarnUseCase';
import { OpenSupportTicketUseCase } from '@/application/usecases/tickets/OpenSupportTicketUseCase';
import { OpenMiddlemanChannelUseCase } from '@/application/usecases/middleman/OpenMiddlemanChannelUseCase';
import { ClaimTradeUseCase } from '@/application/usecases/middleman/ClaimTradeUseCase';
import { SubmitTradeDataUseCase } from '@/application/usecases/middleman/SubmitTradeDataUseCase';
import { ConfirmFinalizationUseCase } from '@/application/usecases/middleman/ConfirmFinalizationUseCase';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { RevokeFinalizationUseCase } from '@/application/usecases/middleman/RevokeFinalizationUseCase';
import { CloseTradeUseCase } from '@/application/usecases/middleman/CloseTradeUseCase';
import { SubmitReviewUseCase } from '@/application/usecases/middleman/SubmitReviewUseCase';
import { GetMemberStatsUseCase } from '@/application/usecases/stats/GetMemberStatsUseCase';
import type { ITicketRepository, TicketParticipantInput } from '@/domain/repositories/ITicketRepository';
import type { IMiddlemanRepository, MiddlemanClaim, MiddlemanProfile } from '@/domain/repositories/IMiddlemanRepository';
import type { ITradeRepository } from '@/domain/repositories/ITradeRepository';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { IMemberStatsRepository } from '@/domain/repositories/IMemberStatsRepository';
import type { IReviewRepository } from '@/domain/repositories/IReviewRepository';
import type { IWarnRepository } from '@/domain/repositories/IWarnRepository';
import { Ticket } from '@/domain/entities/Ticket';
import { Trade } from '@/domain/entities/Trade';
import { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import { Review } from '@/domain/entities/Review';
import { Warn, WarnSeverity } from '@/domain/entities/Warn';
import { TicketStatus, TicketType, type TradeItem } from '@/domain/entities/types';
import { TradeStatus } from '@/domain/value-objects/TradeStatus';
import type { Rating } from '@/domain/value-objects/Rating';
import { middlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';
import { memberCardGenerator } from '@/infrastructure/external/MemberCardGenerator';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COLORS } from '@/shared/config/constants';
import { UnauthorizedActionError, ValidationFailedError } from '@/shared/errors/domain.errors';

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
      throw new Error('Paso en progreso no finalizado');
    }

    const step: StepLog = {
      index: this.steps.length + 1,
      icon,
      title,
      next,
    };

    this.steps.push(step);
    this.current = step;
    this.print(`[${step.index}/${this.total}] ${icon} ${title} — siguiente: ${next}`);
  }

  public complete(detail: string, status: StepLog['status'] = 'OK'): void {
    if (!this.current) {
      throw new Error('No hay paso activo');
    }

    this.current.status = status;
    this.current.detail = detail;
    const icon = status === 'ERROR' ? '❌' : status === 'WARN' ? '⚠️' : '✅';
    this.print(`  ${icon} ${this.current.title} → ${detail}`);
    this.current = null;
  }

  public info(message: string): void {
    this.print(`ℹ️  ${message}`);
  }

  public summary(): void {
    this.print('\nResumen de flujo:');
    for (const step of this.steps) {
      const icon = step.status === 'ERROR' ? '❌' : step.status === 'WARN' ? '⚠️' : '✅';
      const detail = step.detail ? ` — ${step.detail}` : '';
      this.print(`  ${icon} [${step.index}/${this.total}] ${step.title}${detail}`);
    }
  }

  private print(message: string): void {
    console.log(message);
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
  private counter = 0;

  public readonly permissionOverwrites = {
    edit: async (): Promise<void> => {},
  };

  public readonly messagesApi = {
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
    public readonly guild: SimulatedGuild,
    private readonly embedLog: EmbedValidationResult[],
  ) {
    this.messages = this.messagesApi;
  }

  public async send(payload: MessageCreateOptions | InteractionReplyOptions): Promise<SimulatedMessage> {
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
    const embeds = payload.embeds ?? [];
    if (embeds.length === 0) {
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

      this.embedLog.push({
        channelId: this.id,
        messageId: context,
        context,
        embedIndex: index,
      });
    });
  }

  public updateMessage(
    id: string,
    payload: MessageEditOptions | InteractionReplyOptions,
  ): void {
    this.storedMessages.set(id, new SimulatedMessage(id, this, payload));
  }

  public async setName(newName: string): Promise<void> {
    this.name = newName;
  }

  public async delete(): Promise<void> {
    this.storedMessages.clear();
  }
}

class SimulatedMember {
  public readonly roles = {
    cache: {
      map: <T>(mapper: (role: { id: string }) => T): T[] => this.roleIds.map((id) => mapper({ id })),
    },
  };

  public nickname: string | null = null;
  public joinedAt: Date | null = new Date();

  public constructor(
    public readonly id: Snowflake,
    public readonly guild: SimulatedGuild,
    public readonly user: { id: Snowflake; username: string; bot: boolean; globalName?: string | null },
    private readonly roleIds: string[],
  ) {}

  public get displayName(): string {
    return this.user.username;
  }
}

class SimulatedGuild {
  public readonly roles = {
    everyone: { id: 'role-everyone' },
  };

  public readonly members = {
    me: undefined as unknown as SimulatedMember,
    fetch: async (id: Snowflake): Promise<SimulatedMember> => {
      const member = this.membersById.get(id);
      if (!member) {
        throw new Error(`Miembro ${id} no encontrado`);
      }

      return member;
    },
  };

  public readonly channels = {
    create: async (options: { name: string }): Promise<SimulatedTextChannel> => {
      const id = randomUUID();
      const channel = new SimulatedTextChannel(id, options.name, this, this.embedLog);
      this.channelsById.set(id, channel);
      return channel;
    },
  };

  private readonly membersById = new Map<Snowflake, SimulatedMember>();
  private readonly channelsById = new Map<string, SimulatedTextChannel>();

  public constructor(public readonly id: Snowflake, private readonly embedLog: EmbedValidationResult[]) {}

  public addMember(member: SimulatedMember): void {
    this.membersById.set(member.id, member);
  }

  public getChannel(id: string): SimulatedTextChannel | undefined {
    return this.channelsById.get(id);
  }
}
