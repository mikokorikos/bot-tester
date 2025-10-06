// ============================================================================
// RUTA: src/domain/entities/Trade.ts
// ============================================================================

import type { TradeItem } from '@/domain/entities/types';
import { TradeStatus, TradeStatusVO } from '@/domain/value-objects/TradeStatus';
import { InvalidTradeStateError } from '@/shared/errors/domain.errors';

export class Trade {
  private itemsInternal: TradeItem[];

  public constructor(
    public readonly id: number,
    public readonly ticketId: number,
    public readonly userId: bigint,
    public robloxUsername: string,
    public robloxUserId: bigint | null,
    public robloxIdentityId: number | null,
    public status: TradeStatus,
    public confirmed: boolean,
    items: TradeItem[],
    public readonly createdAt: Date,
  ) {
    this.itemsInternal = [...items];
  }

  public get items(): ReadonlyArray<TradeItem> {
    return [...this.itemsInternal];
  }

  public confirm(): void {
    if (this.status === TradeStatus.CANCELLED || this.status === TradeStatus.COMPLETED) {
      throw new InvalidTradeStateError(this.status, TradeStatus.ACTIVE);
    }

    this.confirmed = true;
    if (this.status === TradeStatus.PENDING) {
      this.status = TradeStatus.ACTIVE;
    }
  }

  public complete(): void {
    if (!this.canBeCompleted()) {
      throw new InvalidTradeStateError(this.status, TradeStatus.COMPLETED);
    }

    if (!TradeStatusVO.canTransitionTo(this.status, TradeStatus.COMPLETED)) {
      throw new InvalidTradeStateError(this.status, TradeStatus.COMPLETED);
    }

    this.status = TradeStatus.COMPLETED;
  }

  public cancel(): void {
    if (this.status === TradeStatus.COMPLETED) {
      throw new InvalidTradeStateError(this.status, TradeStatus.CANCELLED);
    }

    this.status = TradeStatus.CANCELLED;
  }

  public addItem(item: TradeItem): void {
    if (this.status === TradeStatus.CANCELLED) {
      throw new InvalidTradeStateError(this.status, this.status);
    }

    this.itemsInternal.push(item);
  }

  public replaceItems(items: ReadonlyArray<TradeItem>): void {
    if (this.status === TradeStatus.CANCELLED) {
      throw new InvalidTradeStateError(this.status, this.status);
    }

    this.itemsInternal = [...items];
  }

  public resetConfirmation(): void {
    if (this.status === TradeStatus.CANCELLED) {
      throw new InvalidTradeStateError(this.status, TradeStatus.PENDING);
    }

    this.confirmed = false;
    this.status = TradeStatus.PENDING;
  }

  public updateRobloxProfile(details: { username?: string; userId?: bigint | null; identityId?: number | null }): void {
    if (details.username) {
      this.robloxUsername = details.username;
    }

    if (details.userId !== undefined) {
      this.robloxUserId = details.userId;
    }

    if (details.identityId !== undefined) {
      this.robloxIdentityId = details.identityId ?? null;
    } else if (details.username) {
      this.robloxIdentityId = null;
    }
  }

  public canBeCompleted(): boolean {
    return this.confirmed && this.status === TradeStatus.ACTIVE;
  }
}
