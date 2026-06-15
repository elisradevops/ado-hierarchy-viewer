import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import http from 'http';
import https from 'https';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AdoClient {
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly token: string) {
    this.axiosInstance = this.createInstance();
  }

  async get<T>(url: string, apiVersion?: string): Promise<T> {
    const versioned = this.appendApiVersion(url, apiVersion);
    return this.executeWithRetry<T>(() =>
      this.axiosInstance
        .get<T>(versioned, this.buildRequestConfig())
        .then(r => r.data)
    );
  }

  async post<T>(url: string, body: unknown, apiVersion?: string): Promise<T> {
    const versioned = this.appendApiVersion(url, apiVersion);
    return this.executeWithRetry<T>(() =>
      this.axiosInstance
        .post<T>(versioned, body, this.buildRequestConfig())
        .then(r => r.data)
    );
  }

  private appendApiVersion(url: string, apiVersion?: string): string {
    const version = apiVersion ?? config.ADO_API_VERSION;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}api-version=${version}`;
  }

  private buildRequestConfig(): InternalAxiosRequestConfig {
    const reqConfig = {} as InternalAxiosRequestConfig;
    return this.applyAuth(reqConfig);
  }

  private createInstance(): AxiosInstance {
    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: config.ADO_MAX_SOCKETS,
      keepAliveMsecs: 300000,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: config.ADO_MAX_SOCKETS,
      keepAliveMsecs: 300000,
      rejectUnauthorized: false, // intentional: on-prem ADO Server may use self-signed certs
    });

    return axios.create({
      httpAgent,
      httpsAgent,
      timeout: config.ADO_REQUEST_TIMEOUT_MS,
    });
  }

  private applyAuth(reqConfig: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    const normalized = this.normalizeToken(this.token);
    if (normalized.kind === 'bearer') {
      const existing = (reqConfig.headers ?? {}) as Record<string, string>;
      reqConfig.headers = {
        ...existing,
        Authorization: `Bearer ${normalized.value}`,
      } as InternalAxiosRequestConfig['headers'];
      delete (reqConfig as unknown as Record<string, unknown>).auth;
    } else {
      // PAT: use HTTP basic auth with empty username
      (reqConfig as unknown as Record<string, unknown>).auth = {
        username: '',
        password: normalized.value,
      };
    }
    return reqConfig;
  }

  private normalizeToken(rawToken: string): { kind: 'pat' | 'bearer'; value: string } {
    const token = String(rawToken ?? '').trim();

    // Check for explicit "Bearer:" prefix
    if (/^bearer:/i.test(token)) {
      const value = token.slice('bearer:'.length).trim();
      if (value) return { kind: 'bearer', value };
    }

    // Check for "Bearer <token>" format
    const bearerMatch = /^bearer\s+(.+)$/i.exec(token);
    if (bearerMatch?.[1]) {
      const value = bearerMatch[1].trim();
      if (value) return { kind: 'bearer', value };
    }

    // Check if it looks like a JWT (three base64url segments)
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)) {
      return { kind: 'bearer', value: token };
    }

    // Default: treat as PAT
    return { kind: 'pat', value: token };
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    const baseDelay = 500;
    let attempts = 0;

    while (true) {
      try {
        return await fn();
      } catch (err: unknown) {
        attempts++;

        if (attempts < retries && this.isRetryableError(err)) {
          const jitter = Math.random() * 0.3 + 0.85; // 0.85–1.15
          const delay = Math.min(baseDelay * Math.pow(2, attempts - 1) * jitter, 5000);
          logger.warn('ADO request failed — retrying', {
            attempt: attempts, maxAttempts: retries, delayMs: Math.round(delay),
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        this.logError(err);
        throw err;
      }
    }
  }

  private isRetryableError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as Record<string, unknown>;

    // Network-level errors
    if (
      e['code'] === 'ECONNRESET' ||
      e['code'] === 'ETIMEDOUT' ||
      e['code'] === 'ENOTFOUND' ||
      (typeof e['message'] === 'string' && e['message'].includes('timeout'))
    ) {
      return true;
    }

    // axios HTTP response errors
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status !== undefined && status >= 500) return true;
      if (status === 429) return true;
    }

    return false;
  }

  private logError(err: unknown): void {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? (data as { message: string }).message
          : typeof data === 'string'
          ? data.substring(0, 200)
          : err.message;
      logger.error('ADO request error', { status, message });
    } else if (err instanceof Error) {
      logger.error('ADO request error', { message: err.message });
    } else {
      logger.error('ADO request unknown error', { err });
    }
  }
}
