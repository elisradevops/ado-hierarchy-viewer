import type { WorkItemRelation, WorkItem } from './ado';

export type Direction = 'forward' | 'reverse';

export interface AdjacencyEdge {
  childId: number;
  rel: string;
  isRef?: boolean; // opposite-direction tagged ref (not recursed in tree)
  /** 'query' = native to the source query's tree structure; 'link' = discovered via a selected link type */
  origin?: 'query' | 'link';
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
  closedLeaves: number;  // leaf items (own subtree) in the configured closed state
  totalLeaves: number;   // total leaf items in own subtree
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
  /** 'query' = reached via the source query's own structure; 'link' = discovered via a selected link type (undefined for roots) */
  linkOrigin?: 'query' | 'link';
  /** True filter-match per the source query's own clauses (not ADO's ancestor/sibling scaffolding). Undefined when no query is active or matches are undeterminable. */
  isQueryMatch?: boolean;
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
  /** True filter-match ids from the source query. Null/undefined = no query or undeterminable. */
  matchedIds?: number[] | null;
}

export interface BuildHierarchyResult {
  roots: TreeNode[];
  orphanIds: number[];
}
