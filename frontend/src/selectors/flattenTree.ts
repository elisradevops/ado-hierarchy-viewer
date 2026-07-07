import type { TreeNode, FlatRow } from '../types';

export function flattenTree(
  roots: TreeNode[],
  expandedIds: Record<number, true>,
  /**
   * When true, walks every node regardless of expandedIds (isExpanded is reported as
   * true for every branch). Used when a filter is active: a match nested under a
   * collapsed ancestor must still be discoverable by filterRows, which can only see
   * rows that were actually flattened — filterRows can't rescue a row that never made
   * it into the flat list. filterRows then prunes back down to matches + their
   * ancestors, so the final visible set stays correct; this parameter only controls
   * what's available for it to search.
   */
  forceExpandAll = false
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
    const isExpanded = hasChildren && (forceExpandAll || Boolean(expandedIds[node.id]));

    // Destructure-to-omit `children` from the row's node payload — ESLint doesn't
    // recognize the rest-sibling exclusion pattern as a "use" of `_children`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
