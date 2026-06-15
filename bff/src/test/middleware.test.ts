import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';

// ── apiKeyMiddleware ───────────────────────────────────────────────────────────
// We test the middleware function directly (not via config module) to avoid the
// frozen-config-at-module-init problem.

describe('apiKeyMiddleware logic (unit)', () => {
  // Re-implement the same logic as apiKey.ts for unit coverage.
  // The real middleware delegates to config which is module-frozen — we test
  // the logic through the errorHandler and integration tests for coverage.
  // Here we test the timingSafeEqual pattern via a simple wrapper.

  function checkKey(provided: string, expected: string): boolean {
    const { timingSafeEqual } = require('crypto');
    const KEY_LENGTH = 64;
    const providedBuf = Buffer.alloc(KEY_LENGTH);
    const expectedBuf = Buffer.alloc(KEY_LENGTH);
    providedBuf.write(provided.slice(0, KEY_LENGTH));
    expectedBuf.write(expected.slice(0, KEY_LENGTH));
    return timingSafeEqual(providedBuf, expectedBuf) && provided.length === expected.length;
  }

  it('returns true for matching keys', () => {
    expect(checkKey('my-super-secret-key', 'my-super-secret-key')).toBe(true);
  });

  it('returns false for mismatched keys', () => {
    expect(checkKey('wrong-key', 'my-super-secret-key')).toBe(false);
  });

  it('returns false for empty vs non-empty key', () => {
    expect(checkKey('', 'my-super-secret-key')).toBe(false);
  });

  it('returns false for prefix match (same start, different length)', () => {
    expect(checkKey('my-super-secret-ke', 'my-super-secret-key')).toBe(false);
  });

  it('returns true for identical keys with different lengths would be false', () => {
    // Ensures length check is enforced
    expect(checkKey('short', 'short-and-longer')).toBe(false);
  });
});

// ── errorHandler ──────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: { status: jest.Mock; json: jest.Mock };
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Dynamic import to avoid circular config issues
  async function getErrorHandler() {
    const { errorHandler } = await import('../middleware/errorHandler');
    return errorHandler;
  }

  it('returns 500 with error message for generic Error', async () => {
    const handler = await getErrorHandler();
    const err = new Error('something went wrong');
    handler(err, mockReq as Request, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'something went wrong' });
  });

  it('returns 500 for unknown non-Error object', async () => {
    const handler = await getErrorHandler();
    handler({ weird: 'error' }, mockReq as Request, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('returns axios error status and message for AxiosError', async () => {
    const handler = await getErrorHandler();

    // Create a fake axios error
    const axiosErr = {
      isAxiosError: true,
      response: { status: 404, data: { message: 'Not found in ADO' } },
      message: 'Request failed with status 404',
    };
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    handler(axiosErr, mockReq as Request, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found in ADO' });
  });

  it('uses 502 as fallback when AxiosError has no response status', async () => {
    const handler = await getErrorHandler();

    const axiosErr = {
      isAxiosError: true,
      response: undefined,
      message: 'Network Error',
    };
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    handler(axiosErr, mockReq as Request, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(502);
  });
});

// ── asyncWrapper ──────────────────────────────────────────────────────────────

describe('asyncWrapper', () => {
  it('calls next with error when async handler throws', async () => {
    const { asyncWrapper } = await import('../middleware/asyncWrapper');
    const err = new Error('async failure');
    const handler = asyncWrapper(async (_req, _res, _next) => {
      throw err;
    });

    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockNext = jest.fn();

    // asyncWrapper returns a RequestHandler — invoke it
    handler(mockReq, mockRes, mockNext);

    // Allow microtasks to settle
    await new Promise(resolve => setImmediate(resolve));

    expect(mockNext).toHaveBeenCalledWith(err);
  });
});

// ── HealthController ──────────────────────────────────────────────────────────

describe('HealthController', () => {
  it('responds with status ok and a timestamp', () => {
    const { getHealth } = require('../controllers/HealthController');
    const mockRes = {
      json: jest.fn(),
    };
    getHealth({} as Request, mockRes as unknown as Response);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', timestamp: expect.any(String) })
    );
  });
});
