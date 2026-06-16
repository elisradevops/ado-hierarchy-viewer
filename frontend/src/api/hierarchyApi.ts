import type { WorkItemRelation, WorkItem, RelationType } from '../types';
import type { HierarchyConfig, AuthCtx } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { httpClient, withRetry, MAX_RETRIES } from './httpClient';
import { buildAuthHeaders } from './authHeaders';
import {
  fetchRelationTypesDirect,
  fetchProjectsDirect,
  fetchWorkItemTypeMetaDirect,
  fetchRelationsDirect,
  fetchHierarchyDirect,
} from './adoDirect';

export async function fetchRelationTypes(
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<RelationType[]> {
  if (ctx.mode === 'extension') {
    return fetchRelationTypesDirect(ctx.orgUrl, ctx.credential, signal);
  }
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
  if (ctx.mode === 'extension') {
    return fetchProjectsDirect(ctx.orgUrl, ctx.credential, signal);
  }
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
  relationType: string;
  direction: string;
}

export async function fetchRelations(
  params: FetchLinksParams,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<WorkItemRelation[]> {
  if (ctx.mode === 'extension') {
    return fetchRelationsDirect(ctx.orgUrl, ctx.credential, params.project, params.relationType, signal);
  }
  const response = await withRetry(() =>
    httpClient.post<{ workItemRelations: WorkItemRelation[] }>(
      '/links',
      params,
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


export async function fetchWorkItemTypeMeta(
  project: string,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<WorkItemTypeMeta> {
  if (ctx.mode === 'extension') {
    return fetchWorkItemTypeMetaDirect(ctx.orgUrl, ctx.credential, project, signal);
  }
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

export async function fetchHierarchy(
  config: HierarchyConfig,
  ctx: AuthCtx,
  signal?: AbortSignal
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[] }> {
  if (ctx.mode === 'extension') {
    return fetchHierarchyDirect(config, ctx.orgUrl, ctx.credential, signal);
  }
  const response = await withRetry(() =>
    httpClient.post<{
      workItemRelations: WorkItemRelation[];
      workItems: WorkItem[];
    }>(
      '/hierarchy',
      {
        project: config.teamProject,
        relationType: config.relationType,
        direction: config.direction,
        closedState: config.closedState,
        effortField: config.effortField,
      },
      {
        headers: buildAuthHeaders(ctx.orgUrl, ctx.credential),
        signal,
      }
    ),
    MAX_RETRIES,
    signal
  );
  return response.data;
}
