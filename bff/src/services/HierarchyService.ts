import { AdoClient } from './AdoClient';
import { cacheGet, cacheSet } from './cache';
import { cacheKey, cacheKeyFromParts } from '../utils/hash';
import { adoConcurrencyLimit } from '../utils/queue';
import { config } from '../config';
import { logger } from '../utils/logger';

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
}

export async function fetchQueryRootIds(
  client: AdoClient,
  orgUrl: string,
  project: string,
  queryId: string
): Promise<number[]> {
  const key = cacheKey(orgUrl, project, 'query', queryId);
  const cached = cacheGet<number[]>(key);
  if (cached) return cached;

  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql/${encodeURIComponent(queryId)}`;

  const result = await withApiVersionFallback(async (apiVersion) => {
    return client.get<{
      queryType: string;
      workItems?: Array<{ id: number }>;
      workItemRelations?: Array<{ source: { id: number } | null; target: { id: number } | null }>;
    }>(url, apiVersion || undefined);
  });

  let rootIds: number[] = [];
  if (result.queryType === 'flat' && Array.isArray(result.workItems)) {
    rootIds = result.workItems.map(wi => wi.id).filter(Number.isInteger);
  } else if (result.queryType === 'tree' && Array.isArray(result.workItemRelations)) {
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

  cacheSet(key, rootIds);
  return rootIds;
}

export async function fetchLinks(
  client: AdoClient,
  orgUrl: string,
  project: string,
  relationTypes: string[]
): Promise<WorkItemRelation[]> {
  const key = cacheKey(orgUrl, project, [...relationTypes].sort().join(','));
  const cached = cacheGet<WorkItemRelation[]>(key);
  if (cached) return cached;

  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql`;

  const inClause = relationTypes.map(rt => `'${rt}'`).join(',');
  const wiqlQuery = {
    // No TOP clause — ADO rejects TOP on WorkItemLinks queries; the server enforces its own cap.
    query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] IN (${inClause}) MODE (MustContain)`,
  };

  const result = await withApiVersionFallback(async (apiVersion) => {
    const response = await client.post<{ workItemRelations: WorkItemRelation[] }>(
      url,
      wiqlQuery,
      apiVersion || undefined
    );
    return response;
  });

  // Filter null/non-integer pairs
  const relations: WorkItemRelation[] = (result.workItemRelations ?? []).filter(r => {
    if (!r.source || !r.target) return false;
    if (!Number.isInteger(r.source.id) || !Number.isInteger(r.target.id)) return false;
    return true;
  });

  cacheSet(key, relations);
  return relations;
}

export async function fetchWorkItems(
  client: AdoClient,
  orgUrl: string,
  project: string,
  ids: number[],
  fields: string[],
  effortField?: string
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const sortedIds = [...ids].sort((a, b) => a - b);
  // Use streaming hash helper to avoid building a ~60KB intermediate string for 10k ids
  const key = cacheKeyFromParts([orgUrl, project, fields.join(',')], sortedIds);
  const cached = cacheGet<WorkItem[]>(key);
  if (cached) return cached;

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
  // 2. Fall back to first field in `fields` not in knownFields (custom effort field).
  // 3. If effortField is a known base field (e.g. OriginalEstimate), read it directly.
  const resolvedEffortField = effortField
    ?? fields.find(fn => !knownFields.has(fn))
    ?? null;

  const allItems: WorkItem[] = batchResults.flat().map(raw => {
    const f = raw.fields;
    const effortRaw = resolvedEffortField != null ? f[resolvedEffortField] : undefined;
    const effort = typeof effortRaw === 'number' && Number.isFinite(effortRaw) ? effortRaw : null;

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
    };
  });

  cacheSet(key, allItems);
  return allItems;
}
