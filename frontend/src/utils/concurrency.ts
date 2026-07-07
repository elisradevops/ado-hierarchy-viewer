/**
 * Minimal concurrency limiter — runs `tasks` through `fn` with at most
 * `limit` in flight at once, preserving each task's original position in the
 * returned array. No new dependency (mirrors the intent of the BFF's
 * `p-limit`-based `adoConcurrencyLimit`, see bff/src/utils/queue.ts) for a
 * single call site that doesn't warrant pulling in the package.
 */
export async function mapWithConcurrency<T, R>(
  tasks: T[],
  limit: number,
  fn: (task: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await fn(tasks[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
