export interface WorkItemRelation {
  rel: string | null;
  source: { id: number; url?: string } | null;
  target: { id: number; url?: string } | null;
  /** 'query' = came from the saved query's own tree structure; 'link' = discovered via selected link types */
  origin?: 'query' | 'link';
}

export interface WorkItem {
  id: number;
  type: string;   // System.WorkItemType
  title: string;  // System.Title
  state: string;  // System.State
  teamProject: string; // System.TeamProject
  effort: number | null; // effortField value (null if absent)
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number | null;
  tags?: string;
  storyPoints?: number | null;
  remainingWork?: number | null;
  originalEstimate?: number | null;
  completedWork?: number | null;
  url?: string;
  /** Set only on synthetic placeholders (see treeBuilder.makePlaceholder) — why this linked
   *  id never resolved to a real work item: no access to it, deleted, or unexplained. */
  placeholderReason?: 'restricted' | 'deleted' | 'missing';
}

export interface WiqlWorkItemRelationsResponse {
  workItemRelations: WorkItemRelation[];
  queryType: string;
  asOf: string;
}

export interface WorkItemsBatchResponse {
  value: Array<{
    id: number;
    fields: Record<string, unknown>;
    url?: string;
  }>;
}

export interface RelationType {
  referenceName: string;
  name: string;
  attributes?: Record<string, unknown>;
}

export interface QueryTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  queryType?: 'flat' | 'tree' | 'oneHop';
  hasChildren: boolean;
  children?: QueryTreeNode[];
}
