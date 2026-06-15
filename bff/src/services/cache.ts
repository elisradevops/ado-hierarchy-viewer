import { LRUCache } from 'lru-cache';
import { config } from '../config';

const cache = new LRUCache<string, NonNullable<unknown>>({
  max: config.CACHE_MAX_ENTRIES,
  ttl: config.CACHE_TTL_MS,
});

export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function cacheSet(key: string, value: NonNullable<unknown>): void {
  cache.set(key, value);
}

export function cacheDelete(key: string): void {
  cache.delete(key);
}
