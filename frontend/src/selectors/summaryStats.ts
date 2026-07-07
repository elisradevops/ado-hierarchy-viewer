export interface SummaryStats {
  totalItems: number;
  overallProgressPct: number; // global closed-leaf / total-leaf ratio across all roots
  totalEffort: number;        // sum of root effortTotal (avoids double-counting children)
  completedLeaves: number;    // sum of root closedLeaves
  totalLeaves: number;        // sum of root totalLeaves
  byType: Record<string, number>;  // { Epic: 3, Feature: 12, ... }
  byState: Record<string, number>; // { Active: 5, Closed: 7, ... }
}

export function computeSummaryStats(
  rootIds: number[],
  rowsById: Record<number, { type: string; state: string; effortTotal: number; progressPct: number; closedLeaves: number; totalLeaves: number }>
): SummaryStats {
  const totalItems = Object.keys(rowsById).length;

  const byType: Record<string, number> = {};
  const byState: Record<string, number> = {};
  for (const row of Object.values(rowsById)) {
    if (row.type) byType[row.type] = (byType[row.type] ?? 0) + 1;
    if (row.state) byState[row.state] = (byState[row.state] ?? 0) + 1;
  }

  let totalEffort = 0;
  let completedLeaves = 0;
  let totalLeaves = 0;

  for (const id of rootIds) {
    const root = rowsById[id];
    if (!root) continue;
    totalEffort += root.effortTotal;
    completedLeaves += root.closedLeaves;
    totalLeaves += root.totalLeaves;
  }

  // Global leaf-count ratio — matches the same definition used by each row's own progressPct,
  // so the summary total is consistent with what's shown per-row instead of an effort-weighted average.
  const overallProgressPct = totalLeaves > 0 ? Math.round((completedLeaves / totalLeaves) * 100 * 100) / 100 : 0;

  return { totalItems, overallProgressPct, totalEffort, completedLeaves, totalLeaves, byType, byState };
}
