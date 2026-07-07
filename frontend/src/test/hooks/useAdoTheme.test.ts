import { describe, it, expect } from 'vitest';
import { isDarkBackground } from '../../hooks/useAdoTheme';

describe('isDarkBackground', () => {
  it('detects dark from 6-digit hex', () => {
    expect(isDarkBackground('#1e1e1e')).toBe(true);
    expect(isDarkBackground('#ffffff')).toBe(false);
  });

  it('detects dark from 3-digit hex shorthand', () => {
    expect(isDarkBackground('#111')).toBe(true);
    expect(isDarkBackground('#fff')).toBe(false);
  });

  it('detects dark from 8-digit hex with alpha', () => {
    expect(isDarkBackground('#1e1e1eff')).toBe(true);
  });

  it('detects dark from rgb()', () => {
    expect(isDarkBackground('rgb(30, 30, 30)')).toBe(true);
    expect(isDarkBackground('rgb(255, 255, 255)')).toBe(false);
  });

  it('detects dark from rgba() ignoring alpha', () => {
    expect(isDarkBackground('rgba(30, 30, 30, 0.9)')).toBe(true);
    expect(isDarkBackground('rgba(255, 255, 255, 0.5)')).toBe(false);
  });

  it('handles hex without a leading #', () => {
    expect(isDarkBackground('1e1e1e')).toBe(true);
  });

  it('fails closed (light) on an unrecognized format', () => {
    expect(isDarkBackground('var(--some-other-var)')).toBe(false);
    expect(isDarkBackground('')).toBe(false);
    expect(isDarkBackground('hsl(0, 0%, 10%)')).toBe(false);
  });
});
