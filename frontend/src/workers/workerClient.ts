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

  // Below threshold or no Worker support: run synchronously
  if (totalItems <= WORKER_THRESHOLD || typeof Worker === 'undefined') {
    return Promise.resolve(buildHierarchy(input));
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }

    const worker = new Worker(
      new URL('./hierarchy.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const cleanup = (): void => { worker.terminate(); };

    signal?.addEventListener('abort', () => { cleanup(); reject(new Error('Aborted')); });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      cleanup();
      const msg = event.data;
      if (msg.ok) { resolve(msg.result); }
      else { reject(new Error(msg.error)); }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err.message));
    };

    worker.postMessage(input);
  });
}
