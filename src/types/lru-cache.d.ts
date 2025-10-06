declare module 'lru-cache' {
  export interface LRUCacheOptions<K, V> {
    max?: number;
    ttl?: number;
  }

  export default class LRUCache<K, V> {
    constructor(options?: LRUCacheOptions<K, V>);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
  }
}
