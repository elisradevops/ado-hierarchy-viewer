import { describe, it, expect } from 'vitest';
import { getFacetValues } from '../../selectors/facetValues';

describe('getFacetValues', () => {
  it('returns empty arrays for empty input', () => {
    const result = getFacetValues({});
    expect(result.types).toEqual([]);
    expect(result.states).toEqual([]);
  });

  it('extracts unique types from rowsById', () => {
    const rowsById = {
      1: { type: 'Epic', state: 'Active' },
      2: { type: 'Feature', state: 'Active' },
      3: { type: 'Epic', state: 'Closed' },
    };
    const result = getFacetValues(rowsById);
    expect(result.types).toEqual(['Epic', 'Feature']);
  });

  it('extracts unique states from rowsById', () => {
    const rowsById = {
      1: { type: 'Epic', state: 'Active' },
      2: { type: 'Feature', state: 'Closed' },
      3: { type: 'Epic', state: 'Active' },
    };
    const result = getFacetValues(rowsById);
    expect(result.states).toEqual(['Active', 'Closed']);
  });

  it('returns sorted types alphabetically', () => {
    const rowsById = {
      1: { type: 'User Story', state: 'New' },
      2: { type: 'Bug', state: 'New' },
      3: { type: 'Feature', state: 'New' },
      4: { type: 'Epic', state: 'New' },
    };
    const result = getFacetValues(rowsById);
    expect(result.types).toEqual(['Bug', 'Epic', 'Feature', 'User Story']);
  });

  it('returns sorted states alphabetically', () => {
    const rowsById = {
      1: { type: 'Epic', state: 'New' },
      2: { type: 'Epic', state: 'Closed' },
      3: { type: 'Epic', state: 'Active' },
    };
    const result = getFacetValues(rowsById);
    expect(result.states).toEqual(['Active', 'Closed', 'New']);
  });

  it('ignores falsy type values', () => {
    const rowsById = {
      1: { type: '', state: 'Active' },
      2: { type: 'Epic', state: 'Active' },
    };
    const result = getFacetValues(rowsById);
    expect(result.types).toEqual(['Epic']);
  });

  it('ignores falsy state values', () => {
    const rowsById = {
      1: { type: 'Epic', state: '' },
      2: { type: 'Epic', state: 'Active' },
    };
    const result = getFacetValues(rowsById);
    expect(result.states).toEqual(['Active']);
  });

  it('handles single row', () => {
    const rowsById = {
      42: { type: 'Bug', state: 'Resolved' },
    };
    const result = getFacetValues(rowsById);
    expect(result.types).toEqual(['Bug']);
    expect(result.states).toEqual(['Resolved']);
  });

  it('handles string keys in rowsById', () => {
    const rowsById: Record<string, { type: string; state: string }> = {
      'a': { type: 'Task', state: 'Active' },
      'b': { type: 'Bug', state: 'Closed' },
    };
    const result = getFacetValues(rowsById);
    expect(result.types).toEqual(['Bug', 'Task']);
    expect(result.states).toEqual(['Active', 'Closed']);
  });
});
