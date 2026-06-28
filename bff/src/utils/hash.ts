import { createHash } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function cacheKey(...parts: string[]): string {
  return sha256(parts.join('|'));
}

/**
 * Like cacheKey but streams numeric ids directly into the hash digest rather
 * than building a large intermediate string (avoids ~60KB allocation for 10k ids).
 */
export function cacheKeyFromParts(strParts: string[], nums: number[]): string {
  const h = createHash('sha256');
  for (const p of strParts) { h.update(p); h.update('|'); }
  for (const n of nums) { h.update(String(n)); h.update(','); }
  return h.digest('hex');
}
