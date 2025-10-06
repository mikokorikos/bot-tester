// ============================================================================
// RUTA: src/domain/entities/Ticket.ts
// ============================================================================

import type { TicketType } from '@/domain/entities/types';
import { TicketStatus } from '@/domain/entities/types';
import { InvalidTicketStateError } from '@/shared/errors/domain.errors';

export class Ticket {
  public constructor(
    public readonly id: number,
    public readonly guildId: bigint,
    public readonly channelId: bigint,
    public readonly ownerId: bigint,
    public readonly type: TicketType,
    public status: TicketStatus,
    public readonly createdAt: Date,
    public closedAt?: Date,
    public assignedMiddlemanId?: bigint,
  ) {}

  public canBeClaimed(): boolean {
    return this.status === TicketStatus.OPEN || this.status === TicketStatus.CONFIRMED;
  }

  public canBeClosed(): boolean {
    return this.status === TicketStatus.CLAIMED || this.status === TicketStatus.CONFIRMED;
  }

  public claim(middlemanId: bigint): void {
    if (!this.canBeClaimed()) {
      throw new InvalidTicketStateError(this.status, TicketStatus.CLAIMED);
    }

    this.status = TicketStatus.CLAIMED;
    this.assignedMiddlemanId = middlemanId;
  }

  public close(): void {
    if (!this.canBeClosed()) {
      throw new InvalidTicketStateError(this.status, TicketStatus.CLOSED);
    }

    this.status = TicketStatus.CLOSED;
    this.closedAt = new Date();
  }

  public reopen(): void {
    if (!this.isClosed()) {
      throw new InvalidTicketStateError(this.status, TicketStatus.OPEN);
    }

    this.status = TicketStatus.OPEN;
    this.closedAt = undefined;
    this.assignedMiddlemanId = undefined;
  }

  public confirm(): void {
    if (this.status !== TicketStatus.OPEN && this.status !== TicketStatus.CLAIMED) {
      throw new InvalidTicketStateError(this.status, TicketStatus.CONFIRMED);
    }

    this.status = TicketStatus.CONFIRMED;
  }

  public isOwnedBy(userId: bigint): boolean {
    return this.ownerId === userId;
  }

  public isOpen(): boolean {
    return this.status !== TicketStatus.CLOSED;
  }

  public isClosed(): boolean {
    return this.status === TicketStatus.CLOSED;
  }
}
