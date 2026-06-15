import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config';

const KEY_COMPARISON_LENGTH = 64; // fixed buffer size, longer than any realistic key

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.BFF_API_KEY) { next(); return; }
  if (req.path === '/api/health') { next(); return; }  // skip health check

  const provided = String(req.headers['x-api-key'] ?? '');
  const expected = config.BFF_API_KEY;

  // Use fixed-length buffers to prevent timing attacks that leak key length
  const providedBuf = Buffer.alloc(KEY_COMPARISON_LENGTH);
  const expectedBuf = Buffer.alloc(KEY_COMPARISON_LENGTH);
  providedBuf.write(provided.slice(0, KEY_COMPARISON_LENGTH));
  expectedBuf.write(expected.slice(0, KEY_COMPARISON_LENGTH));

  // Also check lengths for correctness (but after the constant-time compare)
  const match = timingSafeEqual(providedBuf, expectedBuf) && provided.length === expected.length;

  if (!match) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
}
