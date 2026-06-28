import type { BuildHierarchyInput, BuildHierarchyResult } from '../types';
import { buildHierarchy } from '../services/pipeline';
import { WORKER_THRESHOLD } from '../constants/ui';

type WorkerMessage =
  | { ok: true; result: BuildHierarchyResult }
  | { ok: false; error: string };

export function runHierarchyPipeline(
  input: BuildHierarchyInput,
  signal?: AbortSignal
): Promise<BuildHierarchyResult> {
  const totalItems = input.items.length;

  // Below threshold or no Worker support: defer to microtask so the call
  // does not block the main thread synchronously before the promise resolves.
  if (totalItems <= WORKER_THRESHOLD || typeof Worker === 'undefined') {
    return Promise.resolve().then(() => buildHierarchy(input));
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }

    const worker = new Worker(
      new URL('./hierarchy.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Named handler so it can be removed in cleanup (prevents a one-per-call listener leak)
    const onAbort = (): void => { cleanup(); reject(new Error('Aborted')); };
    const cleanup = (): void => { worker.terminate(); signal?.removeEventListener('abort', onAbort); };

    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      cleanup();
      const msg = event.data;
      if (msg.ok) { resolve(msg.result); }
      else { reject(new Error(msg.error)); }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err.message || 'Worker error'));
    };

    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('Worker message deserialization failed'));
    };

    worker.postMessage(input);
  });
}
