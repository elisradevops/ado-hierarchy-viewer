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
  /** Set only on synthetic placeholder nodes (linked id never resolved) — why, per treeBuilder.makePlaceholder. */
  placeholderReason?: 'restricted' | 'deleted' | 'missing';
  completedWorkTotal: number;
  remainingWorkTotal: number;
  originalEstimateTotal: number;
  /** Count of descendants (any depth, this subtree) whose own completedWork exceeded their
   *  own originalEstimate. Unlike the *Total rollups above, this can never be cancelled out
   *  by a sibling finishing early — it only ever grows climbing up the tree, so a single
   *  overdue item stays visible at every ancestor level regardless of net sum. */
  overdueCount: number;
  /** The relation type that linked this node to its parent (undefined for roots) */
  linkRel?: string;
  /** True when this node is a tagged reference (opposite-direction link) — not recursed */
  isRef?: boolean;
  /** 'query' = reached via the source query's own structure; 'link' = discovered via a selected link type (undefined for roots) */
  linkOrigin?: 'query' | 'link';
  /** True filter-match per the source query's own clauses (not ADO's ancestor/sibling scaffolding). Undefined when no query is active or matches are undeterminable. */
  isQueryMatch?: boolean;
  /** Genuine directional-spine cycles cut on this node — dropped during tree build to
   *  prevent infinite recursion (see treeBuilder.ts). Reciprocal (isRef) and symmetric
   *  (e.g. Related) back-edges are NOT recorded here — they're expected duplicate views
   *  of the same relationship, not cycles. Undefined/empty when this node cut no cycles. */
  cutCycles?: Array<{ target: number; via: string; path: number[] }>;
  /** Ids of ADO work items that are the direct parent of this node's id via 2+ distinct
   *  directional-spine edges — a diamond / multi-parent link, not a cycle (see
   *  graphBuilder.findMultiParents). Undefined when this node has a single spine parent. */
  multiParents?: number[];
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
  /** Why linked ids that never resolved to a work item are missing (no access vs deleted). */
  missingIdReasons?: Record<number, 'restricted' | 'deleted' | 'missing'>;
}

export interface BuildHierarchyResult {
  roots: TreeNode[];
  orphanIds: number[];
}
