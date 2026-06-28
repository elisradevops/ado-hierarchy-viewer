import axios, { type AxiosInstance } from 'axios';
import { REQUEST_TIMEOUT_MS } from '../constants/ui';

// Retry configuration — only for idempotent GET requests, never for 4xx
export const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

function isRetryable(status: number | undefined): boolean {
  if (status === undefined) return true; // network error
  return status === 429 || (status >= 500 && status < 600);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (!isRetryable(status)) throw err; // don't retry 4xx
      if (attempt < retries) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const jitter = 0.85 + Math.random() * 0.3;
        await delay(BASE_DELAY_MS * Math.pow(2, attempt) * jitter);
      }
    }
  }
  throw lastError;
}

export function createHttpClient(): AxiosInstance {
  // Prefer runtime config (injected by env-uri-init.sh → window.APP_CONFIG)
  // over build-time baked value (which may be the sed placeholder string).
  const runtimeUrl = typeof window !== 'undefined' ? window.APP_CONFIG?.BFF_URL : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildUrl = (import.meta as any).env?.VITE_BFF_BASE_URL as string | undefined;
  const isPlaceholder = buildUrl === 'BACKEND-URL-PLACEHOLDER-Bff';
  const baseURL = runtimeUrl ?? (isPlaceholder ? undefined : buildUrl) ?? '/api';

  const instance = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });

  // Response interceptor: surface 401 as auth event
  instance.interceptors.response.use(
    response => response,
    error => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-unauthorized'));
        }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

// Singleton — created once at module load
export const httpClient = createHttpClient();
