export interface SummaryStats {
  totalItems: number;
  overallProgressPct: number; // effort-weighted average of root progressPct; falls back to simple avg if totalEffort is 0
  totalEffort: number;        // sum of root effortTotal (avoids double-counting children)
  byType: Record<string, number>;  // { Epic: 3, Feature: 12, ... }
  byState: Record<string, number>; // { Active: 5, Closed: 7, ... }
}

export function computeSummaryStats(
  rootIds: number[],
  rowsById: Record<number, { type: string; state: string; effortTotal: number; progressPct: number }>
): SummaryStats {
  const totalItems = Object.keys(rowsById).length;

  const byType: Record<string, number> = {};
  const byState: Record<string, number> = {};
  for (const row of Object.values(rowsById)) {
    if (row.type) byType[row.type] = (byType[row.type] ?? 0) + 1;
    if (row.state) byState[row.state] = (byState[row.state] ?? 0) + 1;
  }

  let totalEffort = 0;
  let weightedSum = 0;
  let simpleSum = 0;
  let validRootCount = 0;

  for (const id of rootIds) {
    const root = rowsById[id];
    if (!root) continue;
    validRootCount++;
    totalEffort += root.effortTotal;
    weightedSum += root.progressPct * root.effortTotal;
    simpleSum += root.progressPct;
  }

  let overallProgressPct = 0;
  if (validRootCount > 0) {
    overallProgressPct = totalEffort > 0
      ? weightedSum / totalEffort
      : simpleSum / validRootCount;
  }

  return { totalItems, overallProgressPct, totalEffort, byType, byState };
}
