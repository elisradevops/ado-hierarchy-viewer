import type { TreeNode, FlatRow } from '../types';

export function flattenTree(
  roots: TreeNode[],
  expandedIds: Record<number, true>
): FlatRow[] {
  const rows: FlatRow[] = [];

  function visit(node: TreeNode, depth: number, parentId: number | null): void {
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && Boolean(expandedIds[node.id]);

    rows.push({
      node: {
        id: node.id,
        type: node.type,
        title: node.title,
        state: node.state,
        effort: node.effort,
        effortTotal: node.effortTotal,
        progressPct: node.progressPct,
      },
      depth,
      hasChildren,
      isExpanded,
      parentId,
    });

    if (isExpanded) {
      for (const child of node.children) visit(child, depth + 1, node.id);
    }
  }

  for (const root of roots) visit(root, 0, null);
  return rows;
}
