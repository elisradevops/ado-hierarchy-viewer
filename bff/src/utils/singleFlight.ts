const inFlight = new Map<string, Promise<unknown>>();

/**
 * Coalesces concurrent calls sharing the same key into one underlying fn() invocation.
 * Each caller still gets the fresh result once it resolves — this only dedupes redundant
 * network work for callers that overlap in time, it never serves a stale/cached value on
 * its own. Once the in-flight promise settles, the key is cleared, so the next call always
 * triggers a fresh fn() invocation.
 */
export function withSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
