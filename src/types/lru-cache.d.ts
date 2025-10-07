declare module 'lru-cache' {
  export interface LRUCacheOptions<K = unknown, V = unknown> {
    max?: number;
    ttl?: number;
    dispose?: (value: V, key: K, reason: 'delete' | 'set' | 'evict') => void;
  }

  export class LRUCache<K = unknown, V = unknown> {
    constructor(options?: LRUCacheOptions<K, V>);
    get(key: K): V | undefined;
    set(key: K, value: V): boolean;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
  }
}
