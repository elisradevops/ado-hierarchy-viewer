import { AdoClient } from './AdoClient';
import { cacheGet, cacheSet } from './cache';
import { cacheKey, cacheKeyFromParts } from '../utils/hash';
import { adoConcurrencyLimit } from '../utils/queue';
import { withSingleFlight } from '../utils/singleFlight';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveMatchedIds, type QueryDefinition } from './queryMatchDerivation';
import { normalizeQueryType, extractQueryColumns, extractExtraFields } from '@ado-hierarchy-viewer/query-match-core';

// ADO on-prem api-version fallback chain
const API_VERSIONS = ['7.1', '5.1', ''] as const;

async function withApiVersionFallback<T>(
  buildRequest: (apiVersion: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (const version of API_VERSIONS) {
    try {
      return await buildRequest(version);
    } catch (err) {
      lastError = err;
      // Only retry with lower version on 400/404/405 (version not supported)
      // Stop retrying on 401/403 (auth failures)
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) throw err;
      if (status && status < 400) throw err; // unexpected success-path error
      logger.debug('api-version fallback', { version, status });
    }
  }
  throw lastError;
}

export interface WorkItemRelation {
  rel: string | null;
  source: { id: number } | null;
  target: { id: number } | null;
  /** 'query' = came from the saved query's own tree structure; 'link' = discovered via selected link types */
  origin?: 'query' | 'link';
}

export interface WorkItem {
  id: number;
  type: string;
  title: string;
  state: string;
  teamProject: string;
  effort: number | null;
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
  /** Raw values for fields the baseline query declared that aren't one of the fixed
   *  properties above — keyed by ADO field reference name. Populated by fetchWorkItems
   *  when `fields` includes a reference name outside its knownFields set. */
  extraFields?: Record<string, unknown>;
}

/** One column the baseline ADO query itself declares (WIQL response `columns`). */
export interface QueryColumn {
  referenceName: string;
  name: string;
}

export interface QueryRootsResult {
  rootIds: number[];
  /** Native tree edges from the query itself (empty for flat queries) — origin: 'query' */
  queryRelations: WorkItemRelation[];
  /**
   * True filter-match ids, independent of tree/oneHop ancestor-and-sibling scaffolding
   * ADO includes in the displayed hierarchy. Null when undeterminable (see
   * queryMatchDerivation.ts) — strict-mode highlighting is simply unavailable then.
   */
  matchedIds: number[] | null;
  /** The query's own column set (order preserved) — drives dynamic columns in the frontend.
   *  Empty when the WIQL response carried no columns (older on-prem ADO). */
  queryColumns: QueryColumn[];
}

async function fetchQueryDefinition(
  client: AdoClient,
  orgUrl: string,
  project: string,
  queryId: string
): Promise<QueryDefinition | null> {
  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/queries/${encodeURIComponent(queryId)}?$expand=all`;
  try {
    const def = await withApiVersionFallback(async (apiVersion) => {
      return client.get<QueryDefinition>(url, apiVersion || undefined);
    });
    logger.debug('fetchQueryDefinition result', {
      queryType: def.queryType,
      isInvalidSyntax: def.isInvalidSyntax,
      filterOptions: def.filterOptions,
      sourceClauses: JSON.stringify(def.sourceClauses),
      targetClauses: JSON.stringify(def.targetClauses),
      wiql: def.wiql,
    });
    return def;
  } catch (err) {
    logger.debug('fetchQueryDefinition failed — strict mode unavailable for this query', { err });
    return null;
  }
}

export async function fetchQueryRootIds(
  client: AdoClient,
  orgUrl: string,
  project: string,
  queryId: string,
  bypassCache = false
): Promise<QueryRootsResult> {
  const key = cacheKey(orgUrl, project, 'query', queryId);
  if (!bypassCache) {
    const cached = cacheGet<QueryRootsResult>(key);
    if (cached) return cached;
  }

  return withSingleFlight(key, async () => {
    const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql/${encodeURIComponent(queryId)}`;

    const result = await withApiVersionFallback(async (apiVersion) => {
      return client.get<{
        queryType: string;
        workItems?: Array<{ id: number }>;
        workItemRelations?: Array<{ rel?: string | null; source: { id: number } | null; target: { id: number } | null }>;
        columns?: Array<{ referenceName?: string; name?: string }>;
      }>(url, apiVersion || undefined);
    });

    const queryColumns: QueryColumn[] = extractQueryColumns(result.columns);

    let rootIds: number[] = [];
    let queryRelations: WorkItemRelation[] = [];
    // Normalized against the same shared logic the extension-mode twin uses (which compares
    // the SDK's numeric QueryType enum instead of a raw string) — removes the drift risk of
    // two independent queryType comparisons silently diverging.
    const queryType = normalizeQueryType(result.queryType);

    if (queryType === 'flat' && Array.isArray(result.workItems)) {
      rootIds = result.workItems.map(wi => wi.id).filter(Number.isInteger);
    } else if (queryType === 'tree' && Array.isArray(result.workItemRelations)) {
      queryRelations = result.workItemRelations
        .filter(r => r.source && r.target && Number.isInteger(r.source.id) && Number.isInteger(r.target.id))
        .map(r => ({ rel: r.rel ?? null, source: r.source, target: r.target, origin: 'query' as const }));
      const childIds = new Set(queryRelations.map(r => r.target!.id));
      const seen = new Set<number>();
      rootIds = queryRelations
        .filter(r => !childIds.has(r.source!.id))
        .map(r => r.source!.id)
        .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
    } else if (queryType === 'oneHop' && Array.isArray(result.workItemRelations)) {
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
        .map(r => ({ rel: r.rel ?? null, source: r.source, target: r.target, origin: 'query' as const }));
    }

    let matchedIds: number[] | null;
    if (queryType === 'flat') {
      // Flat queries return no scaffolding — every returned id is already an exact match.
      matchedIds = rootIds;
    } else {
      const presentIds = new Set<number>(rootIds);
      for (const r of queryRelations) {
        presentIds.add(r.source!.id);
        presentIds.add(r.target!.id);
      }
      const queryDef = await fetchQueryDefinition(client, orgUrl, project, queryId);
      matchedIds = queryDef ? await deriveMatchedIds(client, orgUrl, project, queryDef, presentIds) : null;
    }

    const out: QueryRootsResult = { rootIds, queryRelations, matchedIds, queryColumns };
    cacheSet(key, out);
    return out;
  });
}

export async function fetchLinks(
  client: AdoClient,
  orgUrl: string,
  project: string,
  relationTypes: string[],
  /** When provided, restricts the link scan to edges originating from these ids —
   * used to extend outward from the query's baseline instead of scanning the whole project. */
  sourceIds?: number[],
  bypassCache = false
): Promise<WorkItemRelation[]> {
  const key = cacheKeyFromParts(
    [orgUrl, project, [...relationTypes].sort().join(',')],
    sourceIds ? [...sourceIds].sort((a, b) => a - b) : []
  );
  if (!bypassCache) {
    const cached = cacheGet<WorkItemRelation[]>(key);
    if (cached) return cached;
  }

  return withSingleFlight(key, async () => {
    const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql`;
    const inClause = relationTypes.map(rt => `'${rt}'`).join(',');

    // A large seed/frontier set inlined whole into one WIQL `IN (...)` clause can exceed
    // ADO's query length/complexity limit and 400. Chunk it the same way batch work-item
    // fetches already do (config.ADO_BATCH_SIZE) and issue the chunks concurrently.
    const idChunks: number[][] = [];
    if (sourceIds && sourceIds.length > 0) {
      for (let i = 0; i < sourceIds.length; i += config.ADO_BATCH_SIZE) {
        idChunks.push(sourceIds.slice(i, i + config.ADO_BATCH_SIZE));
      }
    } else {
      idChunks.push([]); // no id filter — single unscoped query
    }

    const runQuery = (ids: number[]) => withApiVersionFallback(async (apiVersion) => {
      const idFilter = ids.length > 0 ? ` AND [Source].[System.Id] IN (${ids.join(',')})` : '';
      const wiqlQuery = {
        // No TOP clause — ADO rejects TOP on WorkItemLinks queries; the server enforces its own cap.
        query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] IN (${inClause})${idFilter} MODE (MustContain)`,
      };
      return client.post<{ workItemRelations: WorkItemRelation[] }>(url, wiqlQuery, apiVersion || undefined);
    });

    const chunkResults = await Promise.all(
      idChunks.map(ids => adoConcurrencyLimit(() => runQuery(ids)))
    );

    // Filter null/non-integer pairs, dedupe across chunks (a pair could theoretically
    // recur if source ids overlap between chunks, though chunking itself never overlaps).
    const seenPairs = new Set<string>();
    const relations: WorkItemRelation[] = [];
    for (const result of chunkResults) {
      for (const r of result.workItemRelations ?? []) {
        if (!r.source || !r.target) continue;
        if (!Number.isInteger(r.source.id) || !Number.isInteger(r.target.id)) continue;
        const pairKey = `${r.source.id}-${r.target.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        relations.push(r);
      }
    }

    cacheSet(key, relations);
    return relations;
  });
}

export async function fetchWorkItems(
  client: AdoClient,
  orgUrl: string,
  project: string,
  ids: number[],
  fields: string[],
  effortField?: string,
  bypassCache = false
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const sortedIds = [...ids].sort((a, b) => a - b);
  // Use streaming hash helper to avoid building a ~60KB intermediate string for 10k ids
  const key = cacheKeyFromParts([orgUrl, project, fields.join(',')], sortedIds);
  if (!bypassCache) {
    const cached = cacheGet<WorkItem[]>(key);
    if (cached) return cached;
  }

  return withSingleFlight(key, async () => {
    const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const batchUrl = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/workitemsbatch`;

    const batchSize = config.ADO_BATCH_SIZE;
    const chunks: number[][] = [];
    for (let i = 0; i < sortedIds.length; i += batchSize) {
      chunks.push(sortedIds.slice(i, i + batchSize));
    }

    // Use p-limit for controlled concurrency
    const batchResults = await Promise.all(
      chunks.map(chunk =>
        adoConcurrencyLimit(async () => {
          const result = await withApiVersionFallback(async (apiVersion) => {
            return client.post<{
              value: Array<{ id: number; fields: Record<string, unknown>; url?: string }>;
            }>(
              batchUrl,
              { ids: chunk, fields, errorPolicy: 'Omit' },
              apiVersion || undefined
            );
          });
          return result.value ?? [];
        })
      )
    );

    const knownFields = new Set([
      'System.Id',
      'System.WorkItemType',
      'System.Title',
      'System.State',
      'System.TeamProject',
      'System.AssignedTo',
      'System.AreaPath',
      'System.IterationPath',
      'System.Tags',
      'Microsoft.VSTS.Common.Priority',
      'Microsoft.VSTS.Scheduling.StoryPoints',
      'Microsoft.VSTS.Scheduling.RemainingWork',
      'Microsoft.VSTS.Scheduling.OriginalEstimate',
      'Microsoft.VSTS.Scheduling.CompletedWork',
    ]);

    const numOrNull = (f: Record<string, unknown>, key: string): number | null => {
      const v = f[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    const strOrUndef = (f: Record<string, unknown>, key: string): string | undefined => {
      const v = f[key];
      if (v == null) return undefined;
      // System.AssignedTo is an object { displayName, ... } — extract displayName
      if (typeof v === 'object' && v !== null && 'displayName' in v) {
        return String((v as { displayName: unknown }).displayName ?? '');
      }
      return String(v);
    };

    // Resolve which field carries effort:
    // 1. Use explicit effortField param if provided.
    // 2. Fall back to the sole field in `fields` outside knownFields (custom effort field) —
    //    only when there's exactly one such field. `fields` can now carry many non-fixed
    //    entries (the baseline query's own custom columns get unioned in by the caller), so
    //    guessing "the first one" among several would be as likely wrong as right — bail to
    //    null instead of picking arbitrarily.
    // 3. If effortField is a known base field (e.g. OriginalEstimate), read it directly.
    const nonKnownFields = fields.filter(fn => !knownFields.has(fn));
    const resolvedEffortField = effortField
      ?? (nonKnownFields.length === 1 ? nonKnownFields[0] : null);

    const allItems: WorkItem[] = batchResults.flat().map(raw => {
      const f = raw.fields;
      const effortRaw = resolvedEffortField != null ? f[resolvedEffortField] : undefined;
      const effort = typeof effortRaw === 'number' && Number.isFinite(effortRaw) ? effortRaw : null;

      // Any requested field outside the fixed set (e.g. the baseline query's own custom
      // columns) is surfaced raw here for the frontend's dynamic-column renderer — see
      // constants/columns.ts buildDynamicColumns / types/ado.ts WorkItem.extraFields.
      // Excludes resolvedEffortField too: when it's also one of the query's own columns,
      // its value is already shown via Progress/Time — a duplicate dynamic column would
      // otherwise render the same number twice.
      const extraFields = extractExtraFields(fields, f, fn => knownFields.has(fn), resolvedEffortField);

      return {
        id: raw.id,
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
        url: raw.url,
        extraFields,
      };
    });

    cacheSet(key, allItems);
    return allItems;
  });
}

export type MissingIdReason = 'restricted' | 'deleted' | 'missing';

/**
 * Classifies ids that `fetchWorkItems` omitted (errorPolicy: 'Omit' drops both
 * permission-denied and deleted/nonexistent ids indistinguishably). Probes each id
 * individually via a single-item GET so the UI can show "no access" vs "deleted" instead
 * of one generic "missing" placeholder. Only called for the (normally small) leftover set,
 * not the whole batch — cost stays bounded via the existing concurrency limiter.
 */
export async function classifyMissingIds(
  client: AdoClient,
  orgUrl: string,
  project: string,
  ids: number[]
): Promise<Map<number, MissingIdReason>> {
  const result = new Map<number, MissingIdReason>();
  if (ids.length === 0) return result;

  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;

  await Promise.all(
    ids.map(id =>
      adoConcurrencyLimit(async () => {
        const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/workitems/${id}`;
        try {
          await withApiVersionFallback(apiVersion => client.get(url, apiVersion || undefined));
          // Fetched successfully in isolation — treat as transiently missing from the batch.
          result.set(id, 'missing');
        } catch (err) {
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status === 401 || status === 403) result.set(id, 'restricted');
          else if (status === 404) result.set(id, 'deleted');
          else result.set(id, 'missing');
        }
      })
    )
  );

  return result;
}
