// ============================================================================
// RUTA: src/shared/utils/cooldown-manager.ts
// ============================================================================

interface CooldownEntry {
  expiresAt: number;
}

type CooldownKey = string;
type UserKey = string;

export class CooldownManager {
  private readonly store = new Map<CooldownKey, Map<UserKey, CooldownEntry>>();

  public consume(key: CooldownKey, userId: string, ttlMs: number): boolean {
    const now = Date.now();
    const userCooldowns = this.store.get(key) ?? new Map<UserKey, CooldownEntry>();

    const existing = userCooldowns.get(userId);
    if (existing && existing.expiresAt > now) {
      return false;
    }

    userCooldowns.set(userId, { expiresAt: now + ttlMs });
    this.store.set(key, userCooldowns);
    return true;
  }

  public remaining(key: CooldownKey, userId: string): number {
    const now = Date.now();
    const entry = this.store.get(key)?.get(userId);

    if (!entry) {
      return 0;
    }

    return Math.max(0, entry.expiresAt - now);
  }

  public clear(key: CooldownKey, userId: string): void {
    this.store.get(key)?.delete(userId);
  }
}

export const cooldownManager = new CooldownManager();
