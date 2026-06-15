export interface WorkItemRelation {
  rel: string | null;
  source: { id: number; url?: string } | null;
  target: { id: number; url?: string } | null;
}

export interface WorkItem {
  id: number;
  type: string;   // System.WorkItemType
  title: string;  // System.Title
  state: string;  // System.State
  teamProject: string; // System.TeamProject
  effort: number | null; // effortField value (null if absent)
  url?: string;
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
