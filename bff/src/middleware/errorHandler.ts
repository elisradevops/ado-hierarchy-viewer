import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const message = err.response?.data?.message ?? err.message ?? 'ADO request failed';
    logger.error('ADO proxy error', { status, message });
    res.status(status).json({ error: message });
    return;
  }

  if (err instanceof Error) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
    return;
  }

  logger.error('Unknown error', { err });
  res.status(500).json({ error: 'Internal server error' });
}
