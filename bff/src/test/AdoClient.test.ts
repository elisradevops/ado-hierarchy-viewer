import axios from 'axios';
import { AdoClient } from '../services/AdoClient';

// Mock axios.create so we can intercept the instance methods
jest.mock('axios', () => {
  const actual = jest.requireActual<typeof axios>('axios');
  return {
    ...actual,
    create: jest.fn(),
    isAxiosError: actual.isAxiosError,
  };
});

function makeAxiosError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: unknown };
  };
  err.isAxiosError = true;
  err.response = { status, data: { message: `HTTP ${status}` } };
  return err;
}

describe('AdoClient', () => {
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
    mockPost = jest.fn();

    (axios.create as jest.Mock).mockReturnValue({
      get: mockGet,
      post: mockPost,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth normalization ───────────────────────────────────────────────────────

  describe('PAT auth', () => {
    it('uses basic auth with empty username for PAT tokens', async () => {
      const client = new AdoClient('my-pat-token');
      mockGet.mockResolvedValueOnce({ data: { ok: true } });

      await client.get('https://ado.example.com/_apis/projects');

      expect(mockGet).toHaveBeenCalledTimes(1);
      const [, reqConfig] = mockGet.mock.calls[0] as [string, { auth?: { username: string; password: string } }];
      expect(reqConfig.auth).toEqual({ username: '', password: 'my-pat-token' });
    });
  });

  describe('Bearer token auth', () => {
    it('sets Authorization Bearer header for "Bearer <token>" format', async () => {
      const client = new AdoClient('Bearer my-jwt-token');
      mockGet.mockResolvedValueOnce({ data: { ok: true } });

      await client.get('https://ado.example.com/_apis/projects');

      const [, reqConfig] = mockGet.mock.calls[0] as [string, { headers?: Record<string, string> }];
      expect(reqConfig.headers?.['Authorization']).toBe('Bearer my-jwt-token');
    });

    it('sets Authorization Bearer header for JWT format (three segments)', async () => {
      const jwtLike = 'aaa.bbb.ccc';
      const client = new AdoClient(jwtLike);
      mockGet.mockResolvedValueOnce({ data: { ok: true } });

      await client.get('https://ado.example.com/_apis/projects');

      const [, reqConfig] = mockGet.mock.calls[0] as [string, { headers?: Record<string, string> }];
      expect(reqConfig.headers?.['Authorization']).toBe(`Bearer ${jwtLike}`);
    });
  });

  // ── Retry behaviour ──────────────────────────────────────────────────────────

  describe('retry logic', () => {
    beforeEach(() => {
      // Speed up retry delays for tests
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: Parameters<typeof setTimeout>[0]) => {
        if (typeof fn === 'function') fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('retries on 503 and succeeds on second attempt', async () => {
      const client = new AdoClient('my-pat');
      const axiosErr503 = makeAxiosError(503);
      // Make axios.isAxiosError recognize our fake error
      jest.spyOn(axios, 'isAxiosError').mockImplementation(err =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true
      );

      mockGet
        .mockRejectedValueOnce(axiosErr503)
        .mockResolvedValueOnce({ data: { result: 'ok' } });

      const result = await client.get<{ result: string }>('https://ado.example.com/_apis/test');

      expect(result).toEqual({ result: 'ok' });
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on 400 — throws immediately', async () => {
      const client = new AdoClient('my-pat');
      const axiosErr400 = makeAxiosError(400);
      jest.spyOn(axios, 'isAxiosError').mockImplementation(err =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true
      );

      mockGet.mockRejectedValue(axiosErr400);

      await expect(client.get('https://ado.example.com/_apis/test')).rejects.toMatchObject({
        response: { status: 400 },
      });

      // Only one call — no retry
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('throws the last error after exhausting 3 retries on 503', async () => {
      const client = new AdoClient('my-pat');
      const axiosErr503 = makeAxiosError(503);
      jest.spyOn(axios, 'isAxiosError').mockImplementation(err =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true
      );

      mockGet.mockRejectedValue(axiosErr503);

      await expect(client.get('https://ado.example.com/_apis/test')).rejects.toMatchObject({
        response: { status: 503 },
      });

      // 3 total attempts (initial + 2 retries = 3)
      expect(mockGet).toHaveBeenCalledTimes(3);
    });

    it('retries on 429 (rate limit)', async () => {
      const client = new AdoClient('my-pat');
      const axiosErr429 = makeAxiosError(429);
      jest.spyOn(axios, 'isAxiosError').mockImplementation(err =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true
      );

      mockGet
        .mockRejectedValueOnce(axiosErr429)
        .mockResolvedValueOnce({ data: { ok: true } });

      const result = await client.get<{ ok: boolean }>('https://ado.example.com/_apis/test');
      expect(result).toEqual({ ok: true });
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  // ── URL versioning ────────────────────────────────────────────────────────────

  describe('api-version appending', () => {
    it('appends api-version query param', async () => {
      const client = new AdoClient('pat');
      mockGet.mockResolvedValueOnce({ data: {} });

      await client.get('https://ado.example.com/_apis/projects');

      const [url] = mockGet.mock.calls[0] as [string];
      expect(url).toMatch(/api-version=/);
    });

    it('uses provided apiVersion when passed', async () => {
      const client = new AdoClient('pat');
      mockGet.mockResolvedValueOnce({ data: {} });

      await client.get('https://ado.example.com/_apis/projects', '5.1');

      const [url] = mockGet.mock.calls[0] as [string];
      expect(url).toContain('api-version=5.1');
    });
  });
});
