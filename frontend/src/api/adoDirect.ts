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
import {
  WorkItemTrackingRestClient,
  QueryExpand,
  WorkItemErrorPolicy,
  WorkItemBatchGetRequest,
} from 'azure-devops-extension-api/WorkItemTracking';

import * as SDK from 'azure-devops-extension-sdk';

import type { WorkItemRelation, WorkItem, RelationType, QueryTreeNode } from '../types';
import type { HierarchyConfig } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { BATCH_SIZE, buildWiFields, DEFAULT_EFFORT_FIELD } from '../constants/fields';
import { mapWithConcurrency } from '../utils/concurrency';
import {
  renderClauseTree,
  isDoesNotContainMode,
  unionAndFilterMatches,
  normalizeQueryType,
  type WorkItemQueryClause,
} from '@ado-hierarchy-viewer/query-match-core';

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

// Uses SDK.getWebContext() instead of CoreRestClient.getProjects() — avoids
// api-version=7.2 calls that fail on ADO Server 2022 (max 7.1).
export async function fetchProjectsDirect(
  _orgUrl: string,
  _credential: string,
  signal?: AbortSignal
): Promise<Array<{ id: string; name: string }>> {
  if (signal?.aborted) return [];
  try {
    const ctx = SDK.getWebContext();
    if (ctx?.project?.id && ctx.project.name) {
      return [{ id: ctx.project.id, name: ctx.project.name }];
    }
    return [];
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

// Mirrors the BFF's ADO_CONCURRENCY default (bff/src/config/index.ts) — caps how many
// getWorkItemsBatch calls are in flight at once instead of awaiting chunks serially.
const BATCH_FETCH_CONCURRENCY = 8;

async function fetchWorkItemsBatchDirect(
  project: string,
  ids: number[],
  fields: string[],
  effortField?: string,
  signal?: AbortSignal
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const client = getClient(WorkItemTrackingRestClient);

  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const chunkResults = await mapWithConcurrency(chunks, BATCH_FETCH_CONCURRENCY, async (chunk): Promise<WorkItem[]> => {
    if (signal?.aborted) return [];
    const req = { ids: chunk, fields, errorPolicy: WorkItemErrorPolicy.Omit } as WorkItemBatchGetRequest;
    const raw = await client.getWorkItemsBatch(req, project);

    return (raw ?? []).map((wi): WorkItem => {
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
  });

  return chunkResults.flat();
}

// ─── Query match derivation ─────────────────────────────────────────────────
//
// ADO tree/oneHop queries can pull in ancestor/sibling scaffolding beyond the actual
// filter matches. There's no per-item "this is a real match" flag in the WIQL execution
// response, so matches are independently re-derived by rendering the query's own filter
// clauses (sourceClauses/targetClauses) as standalone flat WIQL and executing them.
// Fail-closed: any clause bucket we can't safely render/execute returns null for that
// bucket rather than guessing.
//
// Clause rendering, operator mapping, and mode-check logic live in the shared
// @ado-hierarchy-viewer/query-match-core package — identical to the BFF's twin in
// bff/src/services/queryMatchDerivation.ts. Only this function's actual transport
// (SDK queryByWiql, vs the BFF's raw AdoClient.post) is extension-specific.

async function executeClauseBucketAsFlatQueryDirect(
  project: string,
  clauseTree: WorkItemQueryClause | null | undefined,
  signal?: AbortSignal
): Promise<number[] | null> {
  if (!clauseTree || signal?.aborted) return null;

  const rendered = renderClauseTree(clauseTree);
  if (rendered === null) return null;

  try {
    const client = getClient(WorkItemTrackingRestClient);
    const result = await client.queryByWiql(
      { query: `SELECT [System.Id] FROM WorkItems WHERE ${rendered}` },
      project
    );
    return (result.workItems ?? []).map(wi => wi.id).filter(Number.isInteger);
  } catch {
    return null;
  }
}

async function deriveMatchedIdsDirect(
  project: string,
  queryDef: import('azure-devops-extension-api/WorkItemTracking').QueryHierarchyItem,
  presentIds: ReadonlySet<number>,
  signal?: AbortSignal
): Promise<number[] | null> {
  if (queryDef.isInvalidSyntax) return null;

  // DoesNotContain modes invert match semantics — bail entirely rather than mislabel.
  // filterOptions here is the numeric LinkQueryMode enum; isDoesNotContainMode already
  // recognizes its DoesNotContain member values (3, 6) alongside the BFF's string form.
  if (isDoesNotContainMode(queryDef.filterOptions)) {
    return null;
  }

  const [sourceIds, targetIds] = await Promise.all([
    executeClauseBucketAsFlatQueryDirect(project, queryDef.sourceClauses, signal),
    executeClauseBucketAsFlatQueryDirect(project, queryDef.targetClauses, signal),
  ]);

  return unionAndFilterMatches(sourceIds, targetIds, presentIds);
}

// ─── Query root IDs fetch ──────────────────────────────────────────────────

export interface QueryRootsResult {
  rootIds: number[];
  /** Native tree edges from the query itself (empty for flat queries) — origin: 'query' */
  queryRelations: WorkItemRelation[];
  /** True filter-match ids, independent of tree/oneHop scaffolding. Null when undeterminable. */
  matchedIds: number[] | null;
}

export async function fetchQueryRootIdsDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  queryId: string,
  signal?: AbortSignal
): Promise<QueryRootsResult> {
  if (signal?.aborted) return { rootIds: [], queryRelations: [], matchedIds: null };
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const result = await client.queryById(queryId, project);

    let rootIds: number[] = [];
    let queryRelations: WorkItemRelation[] = [];
    // Normalized against the same shared logic the BFF twin uses (which compares a
    // lowercased string instead of the SDK's numeric QueryType enum) — removes the
    // drift risk of two independent queryType comparisons silently diverging.
    const normalizedQueryType = normalizeQueryType(result.queryType);
    if (normalizedQueryType === 'flat' && Array.isArray(result.workItems)) {
      rootIds = result.workItems.map(wi => wi.id).filter(Number.isInteger);
    } else if (normalizedQueryType === 'tree' && Array.isArray(result.workItemRelations)) {
      queryRelations = result.workItemRelations
        .filter(r => r.source && r.target && Number.isInteger(r.source.id) && Number.isInteger(r.target.id))
        .map(r => ({ rel: r.rel ?? null, source: { id: r.source!.id }, target: { id: r.target!.id }, origin: 'query' as const }));
      const childIds = new Set(queryRelations.map(r => r.target!.id));
      const seen = new Set<number>();
      rootIds = queryRelations
        .filter(r => !childIds.has(r.source!.id))
        .map(r => r.source!.id)
        .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
    } else if (normalizedQueryType === 'oneHop' && Array.isArray(result.workItemRelations)) {
      // "Direct Links" queries: top-level items are marked by a null-source entry
      // { source: null, target: {id} }; actual one-hop links have both source and target.
      const seen = new Set<number>();
      for (const r of result.workItemRelations) {
        if (!r.source && r.target && Number.isInteger(r.target.id) && !seen.has(r.target.id)) {
          seen.add(r.target.id);
          rootIds.push(r.target.id);
        }
      }
      queryRelations = result.workItemRelations
        .filter(r => r.source && r.target && Number.isInteger(r.source.id) && Number.isInteger(r.target.id))
        .map(r => ({ rel: r.rel ?? null, source: { id: r.source!.id }, target: { id: r.target!.id }, origin: 'query' as const }));
    }

    let matchedIds: number[] | null;
    if (normalizedQueryType === 'flat') {
      // Flat queries return no scaffolding — every returned id is already an exact match.
      matchedIds = rootIds;
    } else {
      const presentIds = new Set<number>(rootIds);
      for (const r of queryRelations) {
        presentIds.add(r.source!.id);
        presentIds.add(r.target!.id);
      }
      try {
        const queryDef = await client.getQuery(project, queryId, QueryExpand.All);
        matchedIds = await deriveMatchedIdsDirect(project, queryDef, presentIds, signal);
      } catch {
        matchedIds = null;
      }
    }

    return { rootIds, queryRelations, matchedIds };
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

// Bounds the cross-project link-following BFS so a pathological/cyclic collection can't hang the UI.
const MAX_PROJECT_HOPS = 15;

export async function fetchHierarchyDirect(
  config: HierarchyConfig,
  _orgUrl: string,
  _credential: string,
  signal?: AbortSignal
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[]; rootIds?: number[]; matchedIds: number[] | null }> {
  let rootIds: number[] | undefined;
  let queryRelations: WorkItemRelation[] = [];
  let matchedIds: number[] | null = null;
  if (config.queryId) {
    const q = await fetchQueryRootIdsDirect('', '', config.teamProject, config.queryId, signal);
    rootIds = q.rootIds;
    queryRelations = q.queryRelations;
    matchedIds = q.matchedIds;
  }

  // N4: abort checks between sequential awaits to skip unnecessary batch fetches after cancel
  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds, matchedIds: null };

  const effortField = config.effortField ?? DEFAULT_EFFORT_FIELD;
  const baseFields = buildWiFields(effortField);
  const completedWork = 'Microsoft.VSTS.Scheduling.CompletedWork';
  const fields = baseFields.includes(completedWork) ? baseFields : [...baseFields, completedWork];

  // Cross-project recursive link-follow: start from config.teamProject, and whenever a
  // newly resolved work item belongs to a project we haven't queried yet, fetch that
  // project's own links too. Bounded by MAX_PROJECT_HOPS + shrinking frontier.
  const linkRelationsByPair = new Map<string, WorkItemRelation>();
  const resolvedItemsById = new Map<number, WorkItem>();
  const knownProjects = new Set<string>([config.teamProject]);

  // Gap #3: skip WIQL when no relation types to avoid empty IN () → ADO 400
  if (config.relationTypes.length > 0) {
    let frontier = [config.teamProject];
    for (let hop = 0; hop < MAX_PROJECT_HOPS && frontier.length > 0 && !signal?.aborted; hop++) {
      // Bounded the same way as fetchWorkItemsBatchDirect above — an unusually wide
      // frontier (many newly-discovered projects in one hop) shouldn't fire unlimited
      // concurrent requests. fetchRelationsDirect already self-guards on signal.aborted
      // at entry, so no extra abort plumbing is needed here.
      const batches = await mapWithConcurrency(frontier, BATCH_FETCH_CONCURRENCY, p =>
        fetchRelationsDirect('', '', p, config.relationTypes, signal)
      );

      const idsToResolve = new Set<number>();
      for (const rels of batches) {
        for (const r of rels) {
          if (!r.source || !r.target) continue;
          const pairKey = `${r.source.id}-${r.target.id}`;
          if (!linkRelationsByPair.has(pairKey)) {
            linkRelationsByPair.set(pairKey, { ...r, origin: 'link' });
          }
          if (!resolvedItemsById.has(r.source.id)) idsToResolve.add(r.source.id);
          if (!resolvedItemsById.has(r.target.id)) idsToResolve.add(r.target.id);
        }
      }

      if (idsToResolve.size === 0 || signal?.aborted) break;

      const newItems = await fetchWorkItemsBatchDirect(config.teamProject, [...idsToResolve], fields, effortField, signal);
      const discoveredProjects = new Set<string>();
      for (const item of newItems) {
        resolvedItemsById.set(item.id, item);
        if (item.teamProject && !knownProjects.has(item.teamProject)) {
          knownProjects.add(item.teamProject);
          discoveredProjects.add(item.teamProject);
        }
      }
      frontier = [...discoveredProjects];
    }
  }

  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds, matchedIds: null };

  // Merge query-native edges with link-discovered edges — the query wins when both
  // describe the same source→target pair (it's the "actual query result").
  const mergedByPair = new Map<string, WorkItemRelation>();
  for (const r of linkRelationsByPair.values()) mergedByPair.set(`${r.source!.id}-${r.target!.id}`, r);
  for (const r of queryRelations) mergedByPair.set(`${r.source!.id}-${r.target!.id}`, r);
  const relations = [...mergedByPair.values()];

  const idSet = new Set<number>();
  for (const r of relations) {
    if (r.source) idSet.add(r.source.id);
    if (r.target) idSet.add(r.target.id);
  }
  if (rootIds) {
    for (const id of rootIds) idSet.add(id);
  }

  const missingIds = [...idSet].filter(id => !resolvedItemsById.has(id));
  const missingItems = missingIds.length > 0
    ? await fetchWorkItemsBatchDirect(config.teamProject, missingIds, fields, effortField, signal)
    : [];
  const workItems = [...resolvedItemsById.values(), ...missingItems];

  return { workItemRelations: relations, workItems, rootIds, matchedIds };
}
