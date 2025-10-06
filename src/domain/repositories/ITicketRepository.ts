// ============================================================================
// RUTA: src/domain/repositories/ITicketRepository.ts
// ============================================================================

import type { Ticket } from '@/domain/entities/Ticket';
import type { TicketStatus, TicketType } from '@/domain/entities/types';
import type { Transactional } from '@/domain/repositories/transaction';
import type { DiscordUserSnapshot } from '@/shared/types/discord';

export interface TicketParticipantInput {
  readonly userId: bigint;
  readonly role?: string | null;
  readonly joinedAt?: Date;
}

export interface CreateTicketData {
  readonly guildId: bigint;
  readonly channelId: bigint;
  readonly ownerId: bigint;
  readonly type: TicketType;
  readonly status?: TicketStatus;
  readonly participants?: ReadonlyArray<TicketParticipantInput>;
  readonly userSnapshots?: ReadonlyArray<DiscordUserSnapshot>;
}

export interface ITicketRepository extends Transactional<ITicketRepository> {
  create(data: CreateTicketData): Promise<Ticket>;
  findById(id: number): Promise<Ticket | null>;
  findByChannelId(channelId: bigint): Promise<Ticket | null>;
  findOpenByOwner(ownerId: bigint): Promise<readonly Ticket[]>;
  update(ticket: Ticket): Promise<void>;
  delete(id: number): Promise<void>;
  countOpenByOwner(ownerId: bigint): Promise<number>;
  isParticipant(ticketId: number, userId: bigint): Promise<boolean>;
  listParticipants(ticketId: number): Promise<readonly TicketParticipantInput[]>;
}
