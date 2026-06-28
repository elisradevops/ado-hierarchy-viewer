import type { WorkItemRelation, WorkItem, RelationType, QueryTreeNode } from '../types';
import type { HierarchyConfig, AuthCtx } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { httpClient, withRetry, MAX_RETRIES } from './httpClient';
import { buildAuthHeaders } from './authHeaders';
import { BATCH_SIZE, buildWiFields } from '../constants/fields';

export async function fetchRelationTypes(
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<RelationType[]> {
  const response = await withRetry(() =>
    httpClient.get<{ value: RelationType[] }>('/relation-types', {
      headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
      signal,
    }),
    MAX_RETRIES,
    signal
  );
  return response.data.value ?? [];
}

export async function fetchProjects(
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<Array<{ id: string; name: string }>> {
  const response = await withRetry(() =>
    httpClient.get<{ value: Array<{ id: string; name: string }> }>('/projects', {
      headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
      signal,
    }),
    MAX_RETRIES,
    signal
  );
  return response.data.value ?? [];
}

export interface FetchLinksParams {
  project: string;
  relationTypes: string[];
}

export async function fetchRelations(
  params: FetchLinksParams,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<WorkItemRelation[]> {
  const response = await withRetry(() =>
    httpClient.post<{ workItemRelations: WorkItemRelation[] }>(
      '/links',
      { project: params.project, relationTypes: params.relationTypes },
      {
        headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
        signal,
      }
    ),
    MAX_RETRIES,
    signal
  );
  return response.data.workItemRelations ?? [];
}

export async function fetchWorkItemsByIds(
  ids: number[],
  ctx: AuthCtx,
  effortField: string,
  signal?: AbortSignal
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const fields = buildWiFields(effortField);

  // Chunk into BATCH_SIZE groups
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const allItems: WorkItem[] = [];
  // Sequential to avoid overwhelming BFF/ADO (BFF handles its own concurrency)
  for (const chunk of chunks) {
    if (signal?.aborted) break;
    const response = await withRetry(() =>
      httpClient.post<{ workItems: WorkItem[] }>(
        '/workitems',
        { ids: chunk, fields },
        {
          headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
          signal,
        }
      ),
      MAX_RETRIES,
      signal
    );
    allItems.push(...(response.data.workItems ?? []));
  }

  return allItems;
}

export async function fetchWorkItemTypeMeta(
  project: string,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<WorkItemTypeMeta> {
  const response = await withRetry(() =>
    httpClient.get<WorkItemTypeMeta>(
      `/work-item-type-meta?project=${encodeURIComponent(project)}`,
      { headers: buildAuthHeaders(ctx.orgUrl, ctx.credential), signal }
    ),
    MAX_RETRIES,
    signal
  );
  return response.data;
}

export async function fetchQueries(
  project: string,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<QueryTreeNode[]> {
  const response = await withRetry(() =>
    httpClient.get<QueryTreeNode[]>(
      `/queries?project=${encodeURIComponent(project)}`,
      { headers: buildAuthHeaders(ctx.orgUrl, ctx.credential), signal }
    ),
    MAX_RETRIES,
    signal
  );
  return response.data ?? [];
}

export async function fetchHierarchy(
  config: HierarchyConfig,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[]; rootIds?: number[] }> {
  const response = await withRetry(() =>
    httpClient.post<{
      workItemRelations: WorkItemRelation[];
      workItems: WorkItem[];
      rootIds?: number[];
    }>(
      '/hierarchy',
      {
        project: config.teamProject,
        relationTypes: config.relationTypes,
        closedState: config.closedState,
        effortField: config.effortField,
        queryId: config.queryId ?? '',
      },
      {
        headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
        signal,
      }
    ),
    MAX_RETRIES,
    signal
  );
  return response.data ?? { workItemRelations: [], workItems: [] };
}
