import type { WorkItemRelation, WorkItem } from './ado';

export type Direction = 'forward' | 'reverse';

export interface AdjacencyEdge {
  childId: number;
  rel: string;
  isRef?: boolean; // opposite-direction tagged ref (not recursed in tree)
}

export type AdjacencyMap = Map<number, AdjacencyEdge[]>;

export interface TreeNode {
  id: number;
  type: string;
  title: string;
  state: string;
  effort: number;       // 0 if source was null
  effortTotal: number;  // own + recursive sum of children
  progressPct: number;  // round(100*closedLeaves/totalLeaves, 2), 0 if no leaves
  children: TreeNode[];
  // Display fields
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number | null;
  tags?: string;
  storyPoints?: number | null;
  remainingWork?: number | null;
  originalEstimate?: number | null;
  completedWork?: number | null;
  completedWorkTotal: number;
  remainingWorkTotal: number;
  /** The relation type that linked this node to its parent (undefined for roots) */
  linkRel?: string;
  /** True when this node is a tagged reference (opposite-direction link) — not recursed */
  isRef?: boolean;
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
  closedState: string;
  rootIds?: number[];
  selectedRels?: string[];
}

export interface BuildHierarchyResult {
  roots: TreeNode[];
  orphanIds: number[];
}
