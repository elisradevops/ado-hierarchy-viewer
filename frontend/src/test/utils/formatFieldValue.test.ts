import { formatFieldValue } from '../../utils/formatFieldValue';

describe('formatFieldValue', () => {
  it('renders null/undefined as an em dash', () => {
    expect(formatFieldValue(null)).toBe('—');
    expect(formatFieldValue(undefined)).toBe('—');
  });

  it('renders booleans as Yes/No', () => {
    expect(formatFieldValue(true)).toBe('Yes');
    expect(formatFieldValue(false)).toBe('No');
  });

  it('renders finite numbers as-is and non-finite as an em dash', () => {
    expect(formatFieldValue(42)).toBe('42');
    expect(formatFieldValue(NaN)).toBe('—');
  });

  it('renders identity objects via displayName', () => {
    expect(formatFieldValue({ displayName: 'Eden Zvi Schwartz', uniqueName: 'eden@x.com' })).toBe('Eden Zvi Schwartz');
  });

  it('renders ISO-8601 date strings as a localized date', () => {
    const result = formatFieldValue('2026-07-08T10:00:00Z');
    expect(result).not.toBe('2026-07-08T10:00:00Z');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders plain strings unchanged', () => {
    expect(formatFieldValue('High')).toBe('High');
  });

  it('renders arrays (picklist multi-select) as a joined, comma-separated string', () => {
    expect(formatFieldValue(['A', 'B', 'C'])).toBe('A, B, C');
  });

  it('renders an empty array as an em dash', () => {
    expect(formatFieldValue([])).toBe('—');
  });

  it('formats each array element recursively, resolving nested identity objects', () => {
    expect(formatFieldValue([{ displayName: 'Alice' }, { displayName: 'Bob' }])).toBe('Alice, Bob');
  });

  it('renders a non-identity, non-array object as an em dash instead of "[object Object]"', () => {
    expect(formatFieldValue({ id: 5, url: 'https://example.com' })).toBe('—');
  });
});
