// CJS-compatible mock for p-limit/queue that bypasses ESM-only p-limit v6.
// In tests, concurrency limiting is a no-op: each task runs immediately.
export const adoConcurrencyLimit = <T>(fn: () => Promise<T>): Promise<T> => fn();
