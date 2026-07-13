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

import type { WorkItemRelation, WorkItem, RelationType, QueryTreeNode, QueryColumn } from '../types';
import type { HierarchyConfig } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { BATCH_SIZE, buildWiFields, DEFAULT_EFFORT_FIELD, KNOWN_FIELD_NAMES } from '../constants/fields';
import { mapWithConcurrency } from '../utils/concurrency';
import {
  renderClauseTree,
  isDoesNotContainMode,
  unionAndFilterMatches,
  normalizeQueryType,
  extractQueryColumns,
  extractExtraFields,
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
    // Gap #1: filter to work-item-to-work-item link types only (matches BFF MetadataController).
    // The extension SDK's REST client always requests enumsAsNumbers=true, so `usage` arrives
    // as its raw numeric enum (0) here, not the Cloud API's string form ('workItemLink') —
    // accept either.
    return (all ?? []).filter(
      rt => rt.attributes?.['usage'] === 'workItemLink' || rt.attributes?.['usage'] === 0
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
  signal?: AbortSignal,
  /** When provided, restricts the link scan to edges originating from these ids —
   * used to extend outward from the query's baseline instead of scanning the whole project. */
  sourceIds?: number[]
): Promise<WorkItemRelation[]> {
  if (signal?.aborted || relationTypes.length === 0) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const inClause = relationTypes.map(rt => `'${rt}'`).join(',');

    // A large seed/frontier set inlined whole into one WIQL `IN (...)` clause can exceed
    // ADO's query length/complexity limit and 400. Chunk it the same way batch work-item
    // fetches already do (BATCH_SIZE) and issue the chunks concurrently.
    const idChunks: number[][] = [];
    if (sourceIds && sourceIds.length > 0) {
      for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
        idChunks.push(sourceIds.slice(i, i + BATCH_SIZE));
      }
    } else {
      idChunks.push([]); // no id filter — single unscoped query
    }

    const runQuery = (ids: number[]) => {
      const idFilter = ids.length > 0 ? ` AND [Source].[System.Id] IN (${ids.join(',')})` : '';
      const wiql = {
        query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] IN (${inClause})${idFilter} MODE (MustContain)`,
      };
      return client.queryByWiql(wiql, project);
    };

    const chunkResults = await mapWithConcurrency(idChunks, BATCH_FETCH_CONCURRENCY, runQuery);

    // Filter null/non-integer pairs, dedupe across chunks (source ids never overlap
    // between chunks, but guard anyway since this feeds a Map keyed by pair elsewhere).
    const seenPairs = new Set<string>();
    const relations: WorkItemRelation[] = [];
    for (const result of chunkResults) {
      for (const r of result.workItemRelations ?? []) {
        if (!r.source || !r.target || !Number.isInteger(r.source.id) || !Number.isInteger(r.target.id)) continue;
        const pairKey = `${r.source.id}-${r.target.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        relations.push({ rel: r.rel ?? null, source: { id: r.source.id }, target: { id: r.target.id } });
      }
    }
    return relations;
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

      // Mirrors HierarchyService.fetchWorkItems (BFF): anything requested outside the
      // fixed field set is a custom query column — surfaced raw for dynamic columns.
      // Excludes resolvedEffort too: when it's also one of the query's own columns, its
      // value is already shown via Progress/Time — no duplicate dynamic column.
      const extraFields = extractExtraFields(fields, f, fn => KNOWN_FIELD_NAMES.has(fn), resolvedEffort);

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
        extraFields,
      };
    });
  });

  return chunkResults.flat();
}

/**
 * Mirrors HierarchyService.classifyMissingIds (BFF): probes ids that getWorkItemsBatch
 * omitted, individually, so a permission-restricted linked item can be distinguished
 * from a genuinely deleted one instead of one generic "missing" placeholder.
 *
 * The status→reason table (401/403→restricted, 404→deleted, else→missing) is duplicated
 * in bff/src/services/HierarchyService.ts and NOT re-derived from a shared source — the
 * two run in different processes/packages. Exported (not just used internally) so the
 * frontend-side table has its own regression test (test/services/adoDirect.test.ts,
 * "classifyMissingIdsDirect parity") mirroring the BFF's classifyMissingIds test cases
 * 1:1; if either table changes, update both tests to keep the contract visible.
 */
export async function classifyMissingIdsDirect(
  project: string,
  ids: number[],
  signal?: AbortSignal
): Promise<Record<number, 'restricted' | 'deleted' | 'missing'>> {
  const result: Record<number, 'restricted' | 'deleted' | 'missing'> = {};
  if (ids.length === 0) return result;

  const client = getClient(WorkItemTrackingRestClient);
  await mapWithConcurrency(ids, BATCH_FETCH_CONCURRENCY, async (id) => {
    if (signal?.aborted) return;
    try {
      await client.getWorkItem(id, project);
      result[id] = 'missing'; // resolved in isolation — transiently missing from the batch
    } catch (err) {
      const status = (err as { status?: number; statusCode?: number }).status
        ?? (err as { status?: number; statusCode?: number }).statusCode;
      if (status === 401 || status === 403) result[id] = 'restricted';
      else if (status === 404) result[id] = 'deleted';
      else result[id] = 'missing';
    }
  });

  return result;
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
  /** The query's own column set (order preserved) — mirrors BFF's QueryRootsResult.queryColumns. */
  queryColumns: QueryColumn[];
}

export async function fetchQueryRootIdsDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  queryId: string,
  signal?: AbortSignal
): Promise<QueryRootsResult> {
  if (signal?.aborted) return { rootIds: [], queryRelations: [], matchedIds: null, queryColumns: [] };
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const result = await client.queryById(queryId, project);

    const queryColumns: QueryColumn[] = extractQueryColumns(result.columns);

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

    return { rootIds, queryRelations, matchedIds, queryColumns };
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

// ADO's queries API can return a folder at the requested $depth boundary
// without its own `isFolder` flag populated (only its own metadata, not its
// children, gets fully hydrated at the cutoff level) — defaulting straight to
// `?? false` then misclassifies that folder as a selectable query. A real
// query always has a queryType; a folder never does — use that as a fallback
// signal when isFolder itself is missing.
function isFolderEntry(item: SdkQueryItem): boolean {
  return item.isFolder ?? item.queryType == null;
}

// ADO caps $depth at 2 server-side (see QUERY_TREE_DEPTH below), so a folder
// at the cutoff arrives with hasChildren=true but no children populated.
// Rather than requesting a bigger depth (400s on-prem), re-fetch that specific
// folder via the SDK's getQuery(project, id, ...) at $depth=2 and splice its
// children in — recursing as deep as needed. Mirrors the
// ensureQueryChildren/collectHistoricalQueries pattern already proven in
// docgen-data-provider-package's TicketsDataProvider.ts for this exact constraint.
async function fillTruncatedFoldersDirect(
  client: WorkItemTrackingRestClient,
  item: SdkQueryItem,
  project: string,
  visited: Set<string> = new Set()
): Promise<void> {
  if (!isFolderEntry(item) || visited.has(item.id)) return;
  visited.add(item.id);

  if (item.hasChildren && (!item.children || item.children.length === 0)) {
    try {
      const refreshed = await client.getQuery(project, item.id, QueryExpand.All, 2);
      item.children = (refreshed as unknown as SdkQueryItem | undefined)?.children;
    } catch {
      return;
    }
  }

  if (item.children && item.children.length > 0) {
    await Promise.all(item.children.map(child => fillTruncatedFoldersDirect(client, child, project, visited)));
  }
}

function mapQueryItem(item: SdkQueryItem): QueryTreeNode {
  const isFolder = isFolderEntry(item);
  return {
    id: item.id,
    name: item.name,
    path: item.path ?? '',
    isFolder,
    hasChildren: item.hasChildren ?? false,
    queryType: isFolder ? undefined : (item.queryType as QueryTreeNode['queryType']),
    children: item.children ? item.children.map(mapQueryItem) : undefined,
  };
}

// ADO's queries API hard-caps $depth at 2 server-side — confirmed against a
// real on-prem ADO Server 2022.1 instance, which 400s with "Acceptable range of
// depth of query tree is between 0 to 2" for anything higher. A previous fix
// here bumped this to 10 to reach queries nested deeper than 2 folders, which
// works against ADO Services/newer Server versions but breaks on-prem 2022.1
// entirely. Capped back at the documented-safe maximum; queries nested deeper
// than 2 folder levels are reached instead via fillTruncatedFoldersDirect
// below, which re-fetches each truncated folder individually. See
// isFolderEntry below for the still-valid fix to the misclassification bug
// (a folder at the depth boundary missing its own isFolder flag).
const QUERY_TREE_DEPTH = 2;

export async function fetchQueriesDirect(
  _orgUrl: string,
  _credential: string,
  project: string,
  signal?: AbortSignal
): Promise<QueryTreeNode[]> {
  if (signal?.aborted) return [];
  try {
    const client = getClient(WorkItemTrackingRestClient);
    const items = (await client.getQueries(project, QueryExpand.All, QUERY_TREE_DEPTH)) as unknown as SdkQueryItem[];
    await Promise.all((items ?? []).map(item => fillTruncatedFoldersDirect(client, item, project)));
    return (items ?? []).map(item => mapQueryItem(item));
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
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[]; rootIds?: number[]; matchedIds: number[] | null; missingIdReasons: Record<number, 'restricted' | 'deleted' | 'missing'>; queryColumns: QueryColumn[] }> {
  // The query is always the baseline — link types only extend outward from the work
  // items the query actually returned, they never seed the hierarchy on their own.
  if (!config.queryId) return { workItemRelations: [], workItems: [], rootIds: [], matchedIds: null, missingIdReasons: {}, queryColumns: [] };
  const q = await fetchQueryRootIdsDirect('', '', config.teamProject, config.queryId, signal);
  const rootIds = q.rootIds;
  const queryRelations = q.queryRelations;
  const matchedIds = q.matchedIds;
  const queryColumns = q.queryColumns;

  // N4: abort checks between sequential awaits to skip unnecessary batch fetches after cancel
  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds, matchedIds: null, missingIdReasons: {}, queryColumns: [] };

  const effortField = config.effortField ?? DEFAULT_EFFORT_FIELD;
  const baseFields = buildWiFields(effortField);
  const completedWork = 'Microsoft.VSTS.Scheduling.CompletedWork';
  // Base fields (incl. all effort fields) are always fetched so Progress/Time can always be
  // computed — the query's own columns are unioned in on top for dynamic columns (mirrors
  // HierarchyController.ts on the BFF side).
  const fields = [...new Set([
    ...baseFields,
    completedWork,
    ...queryColumns.map(c => c.referenceName),
  ])];

  // Seed = every node the query touched (roots + all relation endpoints).
  const seedIds = new Set<number>(rootIds);
  for (const r of queryRelations) {
    seedIds.add(r.source!.id);
    seedIds.add(r.target!.id);
  }

  // Cross-project recursive link-follow, scoped to ids reachable from the query's seed:
  // each hop only asks ADO for links whose Source.Id is in the current frontier, so link
  // types extend the query's tree instead of pulling in the whole project's link graph.
  // Bounded by MAX_PROJECT_HOPS + shrinking frontier.
  const linkRelationsByPair = new Map<string, WorkItemRelation>();
  const resolvedItemsById = new Map<number, WorkItem>();
  const visitedIds = new Set<number>(seedIds);

  // Gap #3: skip WIQL when no relation types to avoid empty IN () → ADO 400
  if (config.relationTypes.length > 0 && seedIds.size > 0) {
    // Resolve seed items up front and bucket the initial frontier by their REAL team
    // project — a cross-project (tree/oneHop) query can seed ids that don't live in
    // config.teamProject, and WIQL's [Source].[System.TeamProject] filter would silently
    // drop their links if hop 0 assumed they were all in config.teamProject.
    const seedItems = await fetchWorkItemsBatchDirect(config.teamProject, [...seedIds], fields, effortField, signal);
    for (const item of seedItems) resolvedItemsById.set(item.id, item);
    let frontierByProject = new Map<string, number[]>();
    for (const item of seedItems) {
      if (!item.teamProject) continue;
      const bucket = frontierByProject.get(item.teamProject);
      if (bucket) bucket.push(item.id);
      else frontierByProject.set(item.teamProject, [item.id]);
    }
    for (let hop = 0; hop < MAX_PROJECT_HOPS && frontierByProject.size > 0 && !signal?.aborted; hop++) {
      const entries = [...frontierByProject.entries()];
      // Bounded the same way as fetchWorkItemsBatchDirect above — an unusually wide
      // frontier (many newly-discovered projects in one hop) shouldn't fire unlimited
      // concurrent requests. fetchRelationsDirect already self-guards on signal.aborted
      // at entry, so no extra abort plumbing is needed here.
      const batches = await mapWithConcurrency(entries, BATCH_FETCH_CONCURRENCY, ([p, ids]) =>
        fetchRelationsDirect('', '', p, config.relationTypes, signal, ids)
      );

      const idsToResolve = new Set<number>();
      for (const rels of batches) {
        for (const r of rels) {
          if (!r.source || !r.target) continue;
          const pairKey = `${r.source.id}-${r.target.id}`;
          if (!linkRelationsByPair.has(pairKey)) {
            linkRelationsByPair.set(pairKey, { ...r, origin: 'link' });
          }
          if (!visitedIds.has(r.target.id)) idsToResolve.add(r.target.id);
        }
      }

      if (idsToResolve.size === 0 || signal?.aborted) break;
      for (const id of idsToResolve) visitedIds.add(id);

      const newItems = await fetchWorkItemsBatchDirect(config.teamProject, [...idsToResolve], fields, effortField, signal);
      const nextFrontierByProject = new Map<string, number[]>();
      for (const item of newItems) {
        resolvedItemsById.set(item.id, item);
        if (!item.teamProject) continue;
        const bucket = nextFrontierByProject.get(item.teamProject);
        if (bucket) bucket.push(item.id);
        else nextFrontierByProject.set(item.teamProject, [item.id]);
      }
      frontierByProject = nextFrontierByProject;
    }
  }

  if (signal?.aborted) return { workItemRelations: [], workItems: [], rootIds, matchedIds: null, missingIdReasons: {}, queryColumns };

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
  for (const id of rootIds) idSet.add(id);

  const missingIds = [...idSet].filter(id => !resolvedItemsById.has(id));
  const missingItems = missingIds.length > 0
    ? await fetchWorkItemsBatchDirect(config.teamProject, missingIds, fields, effortField, signal)
    : [];
  const workItems = [...resolvedItemsById.values(), ...missingItems];

  // Ids still unresolved after the second-chance batch fetch: classify why (no access vs
  // deleted) instead of surfacing a single generic "missing" placeholder to the user.
  const missingItemIds = new Set(missingItems.map(item => item.id));
  const stillMissingIds = missingIds.filter(id => !missingItemIds.has(id));
  const missingIdReasons = stillMissingIds.length > 0 && !signal?.aborted
    ? await classifyMissingIdsDirect(config.teamProject, stillMissingIds, signal)
    : {};

  return { workItemRelations: relations, workItems, rootIds, matchedIds, missingIdReasons, queryColumns };
}
