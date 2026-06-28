import type { TreeNode, FlatRow } from '../types';

export function flattenTree(
  roots: TreeNode[],
  expandedIds: Record<number, true>
): FlatRow[] {
  const rows: FlatRow[] = [];

  // Iterative DFS via explicit stack — avoids call-stack overflow on deeply nested trees.
  // Stack holds items in reverse child order so they are processed left-to-right.
  interface StackEntry { node: TreeNode; depth: number; parentId: number | null; }
  const stack: StackEntry[] = [];

  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ node: roots[i], depth: 0, parentId: null });
  }

  while (stack.length > 0) {
    const { node, depth, parentId } = stack.pop()!;
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && Boolean(expandedIds[node.id]);

    const { children: _children, ...nodeFields } = node;
    rows.push({ node: nodeFields, depth, hasChildren, isExpanded, parentId });

    if (isExpanded) {
      // Push children in reverse order so first child is processed next
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], depth: depth + 1, parentId: node.id });
      }
    }
  }

  return rows;
}
