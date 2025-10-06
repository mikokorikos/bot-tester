// ============================================================================
// RUTA: src/domain/entities/MemberTradeStats.ts
// ============================================================================

export class MemberTradeStats {
  public constructor(
    public readonly userId: bigint,
    public tradesCompleted: number,
    public lastTradeAt: Date | null,
    public robloxUsername: string | null,
    public robloxUserId: bigint | null,
    public partnerTag: string | null,
    public updatedAt: Date,
  ) {}

  public registerTrade(
    completedAt: Date,
    metadata?: { robloxUsername?: string; robloxUserId?: bigint; partnerTag?: string },
  ): void {
    this.tradesCompleted += 1;
    this.lastTradeAt = completedAt;
    this.updatedAt = new Date();

    if (metadata?.robloxUsername) {
      this.robloxUsername = metadata.robloxUsername;
    }

    if (metadata?.robloxUserId !== undefined) {
      this.robloxUserId = metadata.robloxUserId ?? null;
    }

    if (metadata?.partnerTag) {
      this.partnerTag = metadata.partnerTag;
    }
  }

  public summary(): Record<string, string> {
    return {
      'Trades completados': this.tradesCompleted.toString(),
      'Ultimo trade': this.lastTradeAt ? `<t:${Math.floor(this.lastTradeAt.getTime() / 1000)}:R>` : 'N/A',
      'Usuario Roblox': this.robloxUsername ?? 'Sin registrar',
      'Partner frecuente': this.partnerTag ?? 'Sin datos',
    };
  }
}
