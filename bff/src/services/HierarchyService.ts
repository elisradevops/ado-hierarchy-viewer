import { AdoClient } from './AdoClient';
import { cacheGet, cacheSet } from './cache';
import { cacheKey } from '../utils/hash';
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
  url?: string;
}

export async function fetchLinks(
  client: AdoClient,
  orgUrl: string,
  project: string,
  relationType: string,
  direction: string
): Promise<WorkItemRelation[]> {
  const key = cacheKey(orgUrl, project, relationType, direction);
  const cached = cacheGet<WorkItemRelation[]>(key);
  if (cached) return cached;

  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql`;

  const wiqlQuery = {
    query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] = '${relationType}' MODE (MustContain)`,
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
  fields: string[]
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const sortedIds = [...ids].sort((a, b) => a - b);
  const key = cacheKey(orgUrl, project, fields.join(','), sortedIds.join(','));
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
  ]);

  const allItems: WorkItem[] = batchResults.flat().map(raw => {
    const f = raw.fields;
    let effort: number | null = null;
    for (const [fieldName, value] of Object.entries(f)) {
      if (!knownFields.has(fieldName) && typeof value === 'number' && Number.isFinite(value)) {
        effort = value;
        break;
      }
    }

    return {
      id: raw.id,
      type: String(f['System.WorkItemType'] ?? ''),
      title: String(f['System.Title'] ?? ''),
      state: String(f['System.State'] ?? ''),
      teamProject: String(f['System.TeamProject'] ?? ''),
      effort,
      url: raw.url,
    };
  });

  cacheSet(key, allItems);
  return allItems;
}
