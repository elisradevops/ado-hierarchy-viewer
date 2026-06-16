/**
 * Direct Azure DevOps REST calls for extension mode.
 * Used when AuthCtx.mode === 'extension' — no BFF proxy.
 *
 * Logic ported verbatim from:
 *   bff/src/services/HierarchyService.ts
 *   bff/src/controllers/MetadataController.ts
 */

import axios from 'axios';
import type { WorkItemRelation, WorkItem, RelationType } from '../types';
import type { HierarchyConfig } from '../types';
import type { WorkItemTypeMeta } from '../state/workItemMetaStore';
import { withRetry, MAX_RETRIES } from './httpClient';
import { BATCH_SIZE, buildWiFields } from '../constants/fields';

// ADO Server on-prem api-version fallback chain (7.1 → 6.0 → 5.1 → no version)
const API_VERSIONS = ['7.1', '6.0', '5.1', ''] as const;

function makeAdoHeaders(credential: string): Record<string, string> {
  return { Authorization: credential, 'Content-Type': 'application/json' };
}

function normalizeUrl(orgUrl: string): string {
  return orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
}

// Retry across api-versions on 400/404/405; bail immediately on 401/403.
// Matches BFF's withApiVersionFallback (HierarchyService.ts:11-29).
async function withApiVersionFallback<T>(
  buildRequest: (apiVersion: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (const version of API_VERSIONS) {
    try {
      return await buildRequest(version);
    } catch (err) {
      lastError = err;
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) throw err;
      if (status && status < 400) throw err;
    }
  }
  throw lastError;
}

// Surface 401 as auth event (mirrors httpClient.ts interceptor for the BFF path).
function handleAdoError(err: unknown): never {
  if (axios.isAxiosError(err) && err.response?.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth-unauthorized'));
    }
  }
  throw err;
}

// ─── Relation types ────────────────────────────────────────────────────────

export async function fetchRelationTypesDirect(
  orgUrl: string,
  credential: string,
  signal?: AbortSignal
): Promise<RelationType[]> {
  const url = `${normalizeUrl(orgUrl)}_apis/wit/workitemrelationtypes`;
  const headers = makeAdoHeaders(credential);
  try {
    const result = await withRetry(
      () => withApiVersionFallback(apiVersion =>
        axios.get<{ value: RelationType[] }>(url, {
          headers,
          signal,
          params: apiVersion ? { 'api-version': apiVersion } : {},
        }).then(r => r.data)
      ),
      MAX_RETRIES,
      signal
    );
    return result.value ?? [];
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Projects ──────────────────────────────────────────────────────────────

export async function fetchProjectsDirect(
  orgUrl: string,
  credential: string,
  signal?: AbortSignal
): Promise<Array<{ id: string; name: string }>> {
  const url = `${normalizeUrl(orgUrl)}_apis/projects`;
  const headers = makeAdoHeaders(credential);
  try {
    const result = await withRetry(
      () => withApiVersionFallback(apiVersion =>
        axios.get<{ value: Array<{ id: string; name: string }> }>(url, {
          headers,
          signal,
          params: apiVersion ? { 'api-version': apiVersion } : {},
        }).then(r => r.data)
      ),
      MAX_RETRIES,
      signal
    );
    return result.value ?? [];
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Work item type metadata ───────────────────────────────────────────────
// Ported from MetadataController.ts:61-116

export async function fetchWorkItemTypeMetaDirect(
  orgUrl: string,
  credential: string,
  project: string,
  signal?: AbortSignal
): Promise<WorkItemTypeMeta> {
  const baseUrl = `${normalizeUrl(orgUrl)}${encodeURIComponent(project)}/_apis/wit`;
  const headers = makeAdoHeaders(credential);

  type WitTypeEntry = { name: string; color: string; icon?: { id: string; url: string } };
  type WitStateEntry = { name: string; color: string; category: string };

  try {
    const typesData = await withRetry(
      () => withApiVersionFallback(apiVersion =>
        axios.get<{ value: WitTypeEntry[] }>(`${baseUrl}/workitemtypes`, {
          headers,
          signal,
          params: apiVersion ? { 'api-version': apiVersion } : {},
        }).then(r => r.data)
      ),
      MAX_RETRIES,
      signal
    );

    const types = typesData.value ?? [];
    const stateColors: Record<string, string> = {};
    const CHUNK = 6;

    for (let i = 0; i < types.length; i += CHUNK) {
      if (signal?.aborted) break;
      await Promise.all(types.slice(i, i + CHUNK).map(async (t) => {
        try {
          const statesData = await withApiVersionFallback(apiVersion =>
            axios.get<{ value: WitStateEntry[] }>(
              `${baseUrl}/workitemtypes/${encodeURIComponent(t.name)}/states`,
              { headers, signal, params: apiVersion ? { 'api-version': apiVersion } : {} }
            ).then(r => r.data)
          );
          for (const s of statesData.value ?? []) {
            const k = s.name.toLowerCase();
            if (!stateColors[k] && s.color) stateColors[k] = `#${s.color}`;
          }
        } catch { /* non-fatal — individual type failure, hardcoded fallbacks remain */ }
      }));
    }

    return {
      types: types.map(t => ({
        name: t.name,
        color: `#${t.color}`,
        iconUrl: t.icon?.url ?? '',
      })),
      stateColors,
    };
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── WIQL links query ──────────────────────────────────────────────────────
// Ported from HierarchyService.ts:47-83

export async function fetchRelationsDirect(
  orgUrl: string,
  credential: string,
  project: string,
  relationType: string,
  signal?: AbortSignal
): Promise<WorkItemRelation[]> {
  const url = `${normalizeUrl(orgUrl)}${encodeURIComponent(project)}/_apis/wit/wiql`;
  const headers = makeAdoHeaders(credential);
  const wiqlQuery = {
    query: `SELECT [Source].[System.Id],[Target].[System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${project}' AND [System.Links.LinkType] = '${relationType}' MODE (MustContain)`,
  };

  try {
    const result = await withRetry(
      () => withApiVersionFallback(apiVersion =>
        axios.post<{ workItemRelations: WorkItemRelation[] }>(url, wiqlQuery, {
          headers,
          signal,
          params: apiVersion ? { 'api-version': apiVersion } : {},
        }).then(r => r.data)
      ),
      MAX_RETRIES,
      signal
    );

    // Filter null/non-integer pairs — mirrors HierarchyService.ts:75-79
    return (result.workItemRelations ?? []).filter(r => {
      if (!r.source || !r.target) return false;
      if (!Number.isInteger(r.source.id) || !Number.isInteger(r.target.id)) return false;
      return true;
    });
  } catch (err) {
    return handleAdoError(err);
  }
}

// ─── Batch work item fetch ─────────────────────────────────────────────────
// Ported from HierarchyService.ts:85-157

const KNOWN_FIELDS = new Set([
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.TeamProject',
]);

async function fetchWorkItemsBatchDirect(
  orgUrl: string,
  credential: string,
  project: string,
  ids: number[],
  fields: string[],
  signal?: AbortSignal
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const batchUrl = `${normalizeUrl(orgUrl)}${encodeURIComponent(project)}/_apis/wit/workitemsbatch`;
  const headers = makeAdoHeaders(credential);

  type RawItem = { id: number; fields: Record<string, unknown>; url?: string };

  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const allItems: WorkItem[] = [];
  for (const chunk of chunks) {
    if (signal?.aborted) break;
    const result = await withRetry(
      () => withApiVersionFallback(apiVersion =>
        axios.post<{ value: RawItem[] }>(
          batchUrl,
          { ids: chunk, fields, errorPolicy: 'Omit' },
          { headers, signal, params: apiVersion ? { 'api-version': apiVersion } : {} }
        ).then(r => r.data)
      ),
      MAX_RETRIES,
      signal
    );

    // Effort-field heuristic — ported verbatim from HierarchyService.ts:126-153
    const items = (result.value ?? []).map((raw): WorkItem => {
      const f = raw.fields;
      let effort: number | null = null;
      for (const [fieldName, value] of Object.entries(f)) {
        if (!KNOWN_FIELDS.has(fieldName) && typeof value === 'number' && Number.isFinite(value)) {
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
    allItems.push(...items);
  }
  return allItems;
}

// ─── Composite hierarchy fetch ─────────────────────────────────────────────
// Mirrors HierarchyController.ts:77-101 (links → dedupe ids → batch items)

export async function fetchHierarchyDirect(
  config: HierarchyConfig,
  orgUrl: string,
  credential: string,
  signal?: AbortSignal
): Promise<{ workItemRelations: WorkItemRelation[]; workItems: WorkItem[] }> {
  const relations = await fetchRelationsDirect(
    orgUrl,
    credential,
    config.teamProject,
    config.relationType,
    signal
  );

  // Dedupe all source + target IDs (mirrors HierarchyController.ts:96-101)
  const idSet = new Set<number>();
  for (const r of relations) {
    if (r.source) idSet.add(r.source.id);
    if (r.target) idSet.add(r.target.id);
  }

  const fields = buildWiFields(config.effortField);
  const workItems = await fetchWorkItemsBatchDirect(
    orgUrl,
    credential,
    config.teamProject,
    [...idSet],
    fields,
    signal
  );

  return { workItemRelations: relations, workItems };
}
