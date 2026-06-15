import type { WorkItemRelation, WorkItem } from './ado';

export type Direction = 'forward' | 'reverse';

export type AdjacencyMap = Map<number, Set<number>>;

export interface TreeNode {
  id: number;
  type: string;
  title: string;
  state: string;
  effort: number;       // 0 if source was null
  effortTotal: number;  // own + recursive sum of children
  progressPct: number;  // round(100*closedLeaves/totalLeaves, 2), 0 if no leaves
  children: TreeNode[];
}

export interface FlatRow {
  node: Omit<TreeNode, 'children'>;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentId: number | null;
}

export interface BuildHierarchyInput {
  relations: WorkItemRelation[];
  items: WorkItem[];
  direction: Direction;
  closedState: string;
}

export interface BuildHierarchyResult {
  roots: TreeNode[];
  orphanIds: number[];
}
