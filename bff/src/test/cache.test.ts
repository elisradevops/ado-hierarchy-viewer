// Cache module uses LRUCache from lru-cache with config-driven TTL.
// We test the exported cacheGet/cacheSet/cacheDelete API.
// TTL-expiry is not faked here because jest.useFakeTimers doesn't control
// LRUCache's internal Date-based TTL. Instead we test structural behaviour:
// set→get returns value, delete removes it, different keys don't conflict.

import { cacheGet, cacheSet, cacheDelete } from '../services/cache';

describe('cache', () => {
  it('set then get returns the stored value', () => {
    cacheSet('test-key-1', { foo: 'bar' });
    expect(cacheGet<{ foo: string }>('test-key-1')).toEqual({ foo: 'bar' });
  });

  it('get for an unknown key returns undefined', () => {
    expect(cacheGet('nonexistent-key-xyz')).toBeUndefined();
  });

  it('delete removes the entry', () => {
    cacheSet('test-key-2', 42);
    expect(cacheGet('test-key-2')).toBe(42);
    cacheDelete('test-key-2');
    expect(cacheGet('test-key-2')).toBeUndefined();
  });

  it('different keys do not conflict', () => {
    cacheSet('alpha', 'value-alpha');
    cacheSet('beta', 'value-beta');
    expect(cacheGet('alpha')).toBe('value-alpha');
    expect(cacheGet('beta')).toBe('value-beta');
  });

  it('overwriting a key replaces the value', () => {
    cacheSet('overwrite-key', 'first');
    cacheSet('overwrite-key', 'second');
    expect(cacheGet('overwrite-key')).toBe('second');
  });

  it('stores and retrieves arrays', () => {
    const arr = [{ id: 1 }, { id: 2 }];
    cacheSet('array-key', arr);
    expect(cacheGet('array-key')).toEqual(arr);
  });

  it('deleting a non-existent key does not throw', () => {
    expect(() => cacheDelete('does-not-exist')).not.toThrow();
  });
});
