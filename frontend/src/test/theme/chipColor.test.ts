import { describe, it, expect } from 'vitest';
import { readableChipTextColor } from '../../theme/chipColor';
import { contrast } from '../fixtures/contrast';

describe('readableChipTextColor', () => {
  it('darkens a low-contrast color (Task yellow) until it clears WCAG AA on white', () => {
    const before = contrast('#F2CB1D', '#ffffff');
    expect(before).toBeLessThan(4.5); // confirms the bug actually existed
    const fixed = readableChipTextColor('#F2CB1D');
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a low-contrast light-gray state color (New)', () => {
    const fixed = readableChipTextColor('#b2b2b2');
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an already-readable color untouched', () => {
    expect(contrast('#773B93', '#ffffff')).toBeGreaterThanOrEqual(4.5); // Epic purple
    expect(readableChipTextColor('#773B93')).toBe('#773B93');
  });

  it('never darkens past pure black even for an already-black input', () => {
    expect(readableChipTextColor('#000000')).toBe('#000000');
  });

  it('darkens the Affects rel-chip orange (#D97706) until it clears WCAG AA', () => {
    expect(contrast('#D97706', '#ffffff')).toBeLessThan(4.5);
    expect(contrast(readableChipTextColor('#D97706'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens the TestedBy rel-chip green (#059669) until it clears WCAG AA', () => {
    expect(contrast('#059669', '#ffffff')).toBeLessThan(4.5);
    expect(contrast(readableChipTextColor('#059669'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens the progress-bar amber (#f59e0b) until it clears WCAG AA', () => {
    expect(contrast('#f59e0b', '#ffffff')).toBeLessThan(4.5);
    expect(contrast(readableChipTextColor('#f59e0b'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
