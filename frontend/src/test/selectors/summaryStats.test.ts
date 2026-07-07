import { describe, it, expect } from 'vitest';
import { computeSummaryStats } from '../../selectors/summaryStats';

const makeRow = (type: string, state: string, effortTotal: number, progressPct: number, closedLeaves: number, totalLeaves: number) => ({
  type,
  state,
  effortTotal,
  progressPct,
  closedLeaves,
  totalLeaves,
});

describe('computeSummaryStats', () => {
  it('returns zero stats for empty inputs', () => {
    const result = computeSummaryStats([], {});
    expect(result.totalItems).toBe(0);
    expect(result.overallProgressPct).toBe(0);
    expect(result.totalEffort).toBe(0);
    expect(result.byType).toEqual({});
    expect(result.byState).toEqual({});
  });

  it('counts all items in rowsById for totalItems', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 50, 1, 2),
      2: makeRow('Feature', 'Closed', 5, 100, 1, 1),
      3: makeRow('Task', 'Active', 2, 0, 0, 1),
    };
    const result = computeSummaryStats([1], rowsById);
    expect(result.totalItems).toBe(3);
  });

  it('sums effortTotal of roots only for totalEffort', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 50, 1, 2),
      2: makeRow('Feature', 'Active', 5, 80, 4, 5),
    };
    // Only root 1 — child 2 not in rootIds
    const result = computeSummaryStats([1], rowsById);
    expect(result.totalEffort).toBe(10);
  });

  it('computes a global closed-leaf / total-leaf ratio across roots', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 0, 0, 2),
      2: makeRow('Epic', 'Active', 10, 100, 2, 2),
    };
    // global: (0 + 2) closed / (2 + 2) total = 50%
    const result = computeSummaryStats([1, 2], rowsById);
    expect(result.totalEffort).toBe(20);
    expect(result.completedLeaves).toBe(2);
    expect(result.totalLeaves).toBe(4);
    expect(result.overallProgressPct).toBe(50);
  });

  it('is unaffected by effort being zero (no fallback needed with leaf counts)', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 0, 20, 1, 5),
      2: makeRow('Feature', 'Active', 0, 80, 4, 5),
    };
    const result = computeSummaryStats([1, 2], rowsById);
    expect(result.totalEffort).toBe(0);
    // global: (1 + 4) closed / (5 + 5) total = 50%
    expect(result.overallProgressPct).toBe(50);
  });

  it('counts byType across ALL items in rowsById', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 50, 1, 2),
      2: makeRow('Feature', 'Active', 5, 80, 4, 5),
      3: makeRow('Feature', 'Closed', 3, 100, 1, 1),
    };
    const result = computeSummaryStats([1], rowsById);
    expect(result.byType['Epic']).toBe(1);
    expect(result.byType['Feature']).toBe(2);
  });

  it('counts byState across ALL items in rowsById', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 50, 1, 2),
      2: makeRow('Feature', 'Active', 5, 80, 4, 5),
      3: makeRow('Feature', 'Closed', 3, 100, 1, 1),
    };
    const result = computeSummaryStats([1], rowsById);
    expect(result.byState['Active']).toBe(2);
    expect(result.byState['Closed']).toBe(1);
  });

  it('skips missing root ids gracefully', () => {
    const rowsById = {
      1: makeRow('Epic', 'Active', 10, 50, 1, 2),
    };
    // rootId 99 does not exist in rowsById
    const result = computeSummaryStats([1, 99], rowsById);
    expect(result.totalEffort).toBe(10);
    expect(result.overallProgressPct).toBe(50);
  });

  it('handles single root with 100% progress', () => {
    const rowsById = {
      5: makeRow('Epic', 'Closed', 8, 100, 3, 3),
    };
    const result = computeSummaryStats([5], rowsById);
    expect(result.overallProgressPct).toBe(100);
    expect(result.totalEffort).toBe(8);
  });

  it('ignores empty type/state strings in byType/byState', () => {
    const rowsById = {
      1: makeRow('', 'Active', 5, 50, 1, 2),
      2: makeRow('Epic', '', 5, 50, 1, 2),
    };
    const result = computeSummaryStats([1, 2], rowsById);
    expect('' in result.byType).toBe(false);
    expect('' in result.byState).toBe(false);
    expect(result.byType['Epic']).toBe(1);
    expect(result.byState['Active']).toBe(1);
  });
});
