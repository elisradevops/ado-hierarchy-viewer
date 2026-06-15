import type { FlatRow } from '../types';

export type SortCol = 'id' | 'type' | 'title' | 'state' | 'progressPct' | 'effort' | 'effortTotal';

function compareValue(a: FlatRow, b: FlatRow, col: SortCol, dir: 'asc' | 'desc'): number {
  const mult = dir === 'asc' ? 1 : -1;
  const an = a.node;
  const bn = b.node;

  switch (col) {
    case 'id':          return mult * (an.id - bn.id);
    case 'type':        return mult * an.type.localeCompare(bn.type);
    case 'title':       return mult * an.title.localeCompare(bn.title);
    case 'state':       return mult * an.state.localeCompare(bn.state);
    case 'progressPct': return mult * (an.progressPct - bn.progressPct);
    case 'effort':      return mult * (an.effort - bn.effort);
    case 'effortTotal': return mult * (an.effortTotal - bn.effortTotal);
    default: return 0;
  }
}

export function sortRows(rows: FlatRow[], col: SortCol, dir: 'asc' | 'desc'): FlatRow[] {
  if (rows.length === 0) return rows;

  // Group siblings by parent
  const byParent = new Map<number | null, FlatRow[]>();
  for (const row of rows) {
    const key = row.parentId;
    const group = byParent.get(key);
    if (group) {
      group.push(row);
    } else {
      byParent.set(key, [row]);
    }
  }

  // Sort each sibling group
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => compareValue(a, b, col, dir));
  }

  // Reconstruct via DFS
  const result: FlatRow[] = [];
  function dfs(parentId: number | null): void {
    for (const row of byParent.get(parentId) ?? []) {
      result.push(row);
      if (row.hasChildren) dfs(row.node.id);
    }
  }
  dfs(null);
  return result;
}
