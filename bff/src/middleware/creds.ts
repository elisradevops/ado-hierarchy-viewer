import type { Request } from 'express';

export interface AdoCreds {
  orgUrl: string;
  token: string;
}

export function extractCreds(req: Request): AdoCreds | null {
  const orgUrl = String(req.headers['x-ado-org-url'] ?? '').trim();
  const token  = String(req.headers['x-ado-pat']     ?? '').trim();
  if (!orgUrl || !token) return null;
  return { orgUrl, token };
}
