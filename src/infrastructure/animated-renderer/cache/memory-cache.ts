import LRUCache from 'lru-cache';

export interface CacheEntry<TValue> {
  readonly value: TValue;
  readonly createdAt: number;
}

export class MemoryCache<TValue> {
  private readonly cache: LRUCache<string, CacheEntry<TValue>>;

  public constructor(options: { maxEntries: number; ttlMs: number }) {
    this.cache = new LRUCache({
      max: options.maxEntries,
      ttl: options.ttlMs,
    });
  }

  public get(key: string): CacheEntry<TValue> | undefined {
    return this.cache.get(key);
  }

  public set(key: string, value: TValue): void {
    this.cache.set(key, { value, createdAt: Date.now() });
  }
}
