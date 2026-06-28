import type { FlatRow } from '../types';

export interface FilterCriteria {
  text: string;
  types: string[];
  states: string[];
}

function matchesFilter(row: FlatRow, criteria: FilterCriteria): boolean {
  const { text, types, states } = criteria;

  if (text) {
    const lower = text.toLowerCase();
    const titleMatch = row.node.title.toLowerCase().includes(lower);
    const idMatch = String(row.node.id).includes(lower);
    if (!titleMatch && !idMatch) return false;
  }

  if (types.length > 0 && !types.includes(row.node.type)) return false;
  if (states.length > 0 && !states.includes(row.node.state)) return false;

  return true;
}

export function filterRows(rows: FlatRow[], criteria: FilterCriteria): FlatRow[] {
  const { text, types, states } = criteria;
  if (!text && types.length === 0 && states.length === 0) return rows;

  // Find which rows match
  const matchSet = new Set<number>();
  for (const row of rows) {
    if (matchesFilter(row, criteria)) matchSet.add(row.node.id);
  }

  if (matchSet.size === 0) return [];

  // Build depth-ordered rows — retain ancestors of matching rows
  // Walk the flat list and include a row if: it matches OR it is an ancestor of a match
  // L4: single-pass O(n) construction instead of map+new-Map (saves N tuple allocations)
  const rowsByIdMap = new Map<number, FlatRow>();
  for (const r of rows) rowsByIdMap.set(r.node.id, r);
  const result: FlatRow[] = [];
  const includedIds = new Set<number>();
  const ancestorStack: Array<{ id: number; depth: number }> = [];

  for (const row of rows) {
    // Prune the ancestor stack to current depth
    while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1].depth >= row.depth) {
      ancestorStack.pop();
    }

    if (matchSet.has(row.node.id)) {
      // Include all ancestors not yet in result
      for (const ancestor of ancestorStack) {
        if (!includedIds.has(ancestor.id)) {
          const ancestorRow = rowsByIdMap.get(ancestor.id);
          if (ancestorRow) {
            result.push(ancestorRow);
            includedIds.add(ancestor.id);
          }
        }
      }
      result.push(row);
      includedIds.add(row.node.id);
    }

    if (row.hasChildren) {
      ancestorStack.push({ id: row.node.id, depth: row.depth });
    }
  }

  return result;
}
