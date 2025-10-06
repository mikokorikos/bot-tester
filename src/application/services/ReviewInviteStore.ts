// =============================================================================
// RUTA: src/application/services/ReviewInviteStore.ts
// =============================================================================

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface ReviewInviteMetadata {
  readonly ticketId: number;
  readonly middlemanId: string;
  readonly expiresAt: number;
  timeoutId: TimeoutHandle;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class ReviewInviteStore {
  private readonly invites = new Map<string, ReviewInviteMetadata>();

  public set(messageId: string, data: { ticketId: number; middlemanId: string }): void {
    this.clear(messageId);

    const timeoutId: TimeoutHandle = setTimeout(() => {
      this.invites.delete(messageId);
    }, TTL_MS);

    if (typeof timeoutId === 'object' && timeoutId !== null && 'unref' in timeoutId) {
      timeoutId.unref();
    }

    this.invites.set(messageId, {
      ticketId: data.ticketId,
      middlemanId: data.middlemanId,
      expiresAt: Date.now() + TTL_MS,
      timeoutId,
    });
  }

  public get(messageId: string): { ticketId: number; middlemanId: string } | null {
    const invite = this.invites.get(messageId);
    if (!invite) {
      return null;
    }

    if (Date.now() > invite.expiresAt) {
      this.clear(messageId);
      return null;
    }

    return { ticketId: invite.ticketId, middlemanId: invite.middlemanId };
  }

  public clear(messageId: string): void {
    const invite = this.invites.get(messageId);
    if (invite) {
      clearTimeout(invite.timeoutId);
      this.invites.delete(messageId);
    }
  }
}

export const reviewInviteStore = new ReviewInviteStore();
