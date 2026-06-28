/**
 * Direct Azure DevOps REST calls for extension mode using azure-devops-extension-api.
 * getClient() is CORS-safe: requests go through the SDK's XDM/iframe channel.
 *
 * Used when mode === 'extension'. Standalone mode routes to the BFF (hierarchyApi.ts).
 *
 * orgUrl/credential params are accepted but unused — the SDK owns org + auth internally.
 * Keeping them preserves call-site signatures without churn.
 */

import { getClient } from 'azure-devops-extension-api';
import { CoreRestClient } from 'azure-devops-extension-api/Core';
import {
  WorkItemTrackingRestClient,
  QueryExpand,
  QueryType,
  WorkItemErrorPolicy,
  WorkItemBatchGetRequest,
} from 'azure-devops-extension-api/WorkItemTracking';

import type { WorkItemRelation, WorkItem, RelationType, QueryTreeNode } from '../types';
import type { HierarchyConfig } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { BATCH_SIZE, buildWiFields, DEFAULT_EFFORT_FIELD } from '../constants/fields';

// ─── Auth error broadcast ──────────────────────────────────────────────────

function handleAdoError(err: unknown): never {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode;
  if (status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-unauthorized'));
  }
  throw err;
}

// ─── Relation types ────────────────────────────────────────────────────────

export async function fetchRelationTypesDirect(
  _orgUrl: string,
  _credential: string,
  signal?: AbortSignal
): Promise<RelationType[]> {
  if (signal?.aborted) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const all = await client.getRelationTypes();
    // Gap #1: filter to work-item-to-work-item link types only (matches BFF MetadataController)
    return (all ?? []).filter(
      rt => rt.attributes?.['usage'] === 'workItemLink'
    ) as unknown as RelationType[];
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Projects ──────────────────────────────────────────────────────────────

export async function fetchProjectsDirect(
  _orgUrl: string,
  _credential: string,
  signal?: AbortSignal
): Promise<Array<{ id: string; name: string }>> {
  if (signal?.aborted) return [];
  try {
    const client = getClient(CoreRestClient);
    const projects = await client.getProjects();
    return (projects ?? []).map(p => ({ id: p.id ?? '', name: p.name ?? '' }));
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Work item type metadata ───────────────────────────────────────────────

export async function fetchWorkItemTypeMetaDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  signal?: AbortSignal
): Promise<WorkItemTypeMeta> {
  if (signal?.aborted) return { types: [], stateColors: {}, fieldsByType: {} };
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const witTypes = await client.getWorkItemTypes(project);

    const stateColors: Record<string, string> = {};
    const fieldsByType: Record<string, string[]> = {};

    for (const t of witTypes ?? []) {
      if (signal?.aborted) break;

      // State colors — WorkItemType.states populated by getWorkItemTypes
      for (const s of t.states ?? []) {
        const k = s.name?.toLowerCase() ?? '';
        if (k && !stateColors[k] && s.color) {
          stateColors[k] = s.color.startsWith('#') ? s.color : `#${s.color}`;
        }
      }

      // Gap #2: fieldsByType from WorkItemType.fields / fieldInstances
      const refs = (t.fields ?? t.fieldInstances ?? []).map(
        (f: { referenceName?: string }) => f.referenceName ?? ''
      ).filter(Boolean);
      if (refs.length > 0) {
        fieldsByType[t.name] = refs;
      }
    }

    return {
      types: (witTypes ?? []).map(t => ({
        name: t.name,
        color: t.color ? (t.color.startsWith('#') ? t.color : `#${t.color}`) : '',
        iconUrl: t.icon?.url ?? '',
      })),
      stateColors,
      fieldsByType,
    };
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── WIQL links query ──────────────────────────────────────────────────────

export async function fetchRelationsDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  relationTypes: string[],
  signal?: AbortSignal
): Promise<WorkItemRelation[]> {
  if (signal?.aborted || relationTypes.length === 0) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const inClause = relationTypes.map(rt => `'${rt}'`).join(',');
    const wiql = {
      query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] IN (${inClause}) MODE (MustContain)`,
    };
    const result = await client.queryByWiql(wiql, project);

    return (result.workItemRelations ?? [])
      .filter(r => r.source && r.target && Number.isInteger(r.source.id) && Number.isInteger(r.target.id))
      .map(r => ({
        rel: r.rel ?? null,
        source: r.source ? { id: r.source.id } : null,
        target: r.target ? { id: r.target.id } : null,
      })) as WorkItemRelation[];
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Batch work item fetch ─────────────────────────────────────────────────

const numOrNull = (f: Record<string, unknown>, key: string): number | null => {
  const v = f[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const strOrUndef = (f: Record<string, unknown>, key: string): string | undefined => {
  const v = f[key];
  if (v == null) return undefined;
  if (typeof v === 'object' && v !== null && 'displayName' in v) {
    return String((v as { displayName: unknown }).displayName ?? '');
  }
  return String(v);
};

async function fetchWorkItemsBatchDirect(
  project: string,
  ids: number[],
  fields: string[],
  effortField?: string,
  signal?: AbortSignal
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const client = getClient(WorkItemTrackingRestClient);
  const allItems: WorkItem[] = [];

  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    if (signal?.aborted) break;
    const req = { ids: chunk, fields, errorPolicy: WorkItemErrorPolicy.Omit } as WorkItemBatchGetRequest;
    const raw = await client.getWorkItemsBatch(req, project);

    const mapped = (raw ?? []).map((wi): WorkItem => {
      const f = (wi.fields ?? {}) as Record<string, unknown>;
      const resolvedEffort = effortField ?? DEFAULT_EFFORT_FIELD;
      const effortRaw = f[resolvedEffort];
      const effort = typeof effortRaw === 'number' && Number.isFinite(effortRaw) ? effortRaw : null;
      return {
        id: wi.id ?? 0,
        type: String(f['System.WorkItemType'] ?? ''),
        title: String(f['System.Title'] ?? ''),
        state: String(f['System.State'] ?? ''),
        teamProject: String(f['System.TeamProject'] ?? ''),
        effort,
        assignedTo: strOrUndef(f, 'System.AssignedTo'),
        areaPath: strOrUndef(f, 'System.AreaPath'),
        iterationPath: strOrUndef(f, 'System.IterationPath'),
        priority: numOrNull(f, 'Microsoft.VSTS.Common.Priority'),
        tags: strOrUndef(f, 'System.Tags'),
        storyPoints: numOrNull(f, 'Microsoft.VSTS.Scheduling.StoryPoints'),
        remainingWork: numOrNull(f, 'Microsoft.VSTS.Scheduling.RemainingWork'),
        originalEstimate: numOrNull(f, 'Microsoft.VSTS.Scheduling.OriginalEstimate'),
        completedWork: numOrNull(f, 'Microsoft.VSTS.Scheduling.CompletedWork'),
        url: wi.url,
      };
    });
    allItems.push(...mapped);
  }
  return allItems;
}

// ─── Query root IDs fetch ──────────────────────────────────────────────────

export async function fetchQueryRootIdsDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  queryId: string,
  signal?: AbortSignal
): Promise<number[]> {
  if (signal?.aborted) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const result = await client.queryById(queryId, project);

    let rootIds: number[] = [];
    // N1: compare against QueryType enum — SDK returns numeric (QueryType.Flat = 1)
    if (result.queryType === QueryType.Flat && Array.isArray(result.workItems)) {
      rootIds = result.workItems.map(wi => wi.id).filter(Number.isInteger);
    } else if (Array.isArray(result.workItemRelations)) {
      const childIds = new Set(
        result.workItemRelations
          .filter(r => r.target && Number.isInteger(r.target.id))
          .map(r => r.target!.id)
      );
      const seen = new Set<number>();
      rootIds = result.workItemRelations
        .filter(r => r.source && Number.isInteger(r.source.id) && !childIds.has(r.source.id))
        .map(r => r.source!.id)
        .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
    }
    return rootIds;
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Query tree fetch ──────────────────────────────────────────────────────

type SdkQueryItem = {
  id: string; name: string; path?: string;
  isFolder?: boolean; hasChildren?: boolean; queryType?: unknown;
  children?: SdkQueryItem[];
};

function mapQueryItem(item: SdkQueryItem): QueryTreeNode {
  return {
    id: item.id,
    name: item.name,
    path: item.path ?? '',
    isFolder: item.isFolder ?? false,
    hasChildren: item.hasChildren ?? false,
    queryType: item.isFolder ? undefined : (item.queryType as QueryTreeNode['queryType']),
    children: item.children ? item.children.map(mapQueryItem) : undefined,
  };
}

export async function fetchQueriesDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  signal?: AbortSignal
): Promise<QueryTreeNode[]> {
  if (signal?.aborted) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const items = await client.getQueries(project, QueryExpand.All, 2);
    return (items ?? []).map(item => mapQueryItem(item as unknown as SdkQueryItem));
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Composite hierarchy fetch ─────────────────────────────────────────────

export async function fetchHierarchyDirect(
  config: HierarchyConfig,
  _orgUrl: string,
  _credential: string,
  signal?: AbortSignal
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[]; rootIds?: number[] }> {
  let rootIds: number[] | undefined;
  if (config.queryId) {
    rootIds = await fetchQueryRootIdsDirect('', '', config.teamProject, config.queryId, signal);
  }

  // N4: abort checks between sequential awaits to skip unnecessary batch fetches after cancel
  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds };

  // Gap #3: skip WIQL when no relation types to avoid empty IN () → ADO 400
  const relations = config.relationTypes.length > 0
    ? await fetchRelationsDirect('', '', config.teamProject, config.relationTypes, signal)
    : [];

  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds };

  const idSet = new Set<number>();
  for (const r of relations) {
    if (r.source) idSet.add(r.source.id);
    if (r.target) idSet.add(r.target.id);
  }
  if (rootIds) {
    for (const id of rootIds) idSet.add(id);
  }

  // Gap #4: DEFAULT_EFFORT_FIELD fallback when effortField not configured
  const effortField = config.effortField ?? DEFAULT_EFFORT_FIELD;
  // Gap #5: include CompletedWork (missing from original adoDirect)
  const baseFields = buildWiFields(effortField);
  const completedWork = 'Microsoft.VSTS.Scheduling.CompletedWork';
  const fields = baseFields.includes(completedWork) ? baseFields : [...baseFields, completedWork];

  const workItems = await fetchWorkItemsBatchDirect(
    config.teamProject,
    [...idSet],
    fields,
    effortField,
    signal
  );

  return { workItemRelations: relations, workItems, rootIds };
}
