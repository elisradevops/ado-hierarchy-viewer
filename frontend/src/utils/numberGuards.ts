/**
 * Returns the number if it is a finite number, otherwise the fallback (default 0).
 */
export function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Calls .toFixed(decimals) only on finite numbers; returns fallback string otherwise.
 */
export function safeToFixed(value: unknown, decimals: number, fallback = '0'): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(decimals);
  }
  return fallback;
}

/**
 * Returns a percentage string rounded to 1 decimal place.
 * Guards against NaN/Infinity from division.
 */
export function safePercent(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100 * 10) / 10;
}
