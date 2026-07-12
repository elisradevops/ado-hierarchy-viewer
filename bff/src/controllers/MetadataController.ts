import type { Request, Response, NextFunction } from 'express';
import { AdoClient } from '../services/AdoClient';
import { extractCreds } from '../middleware/creds';
import { cacheGet, cacheSet } from '../services/cache';
import { cacheKey } from '../utils/hash';
import { logger } from '../utils/logger';

interface RelationTypeEntry {
  referenceName: string;
  name: string;
  attributes?: Record<string, unknown>;
}

interface WitTypeEntry {
  name: string;
  color: string;           // 6-char hex without '#'
  icon?: { id: string; url: string };
  fields?: Array<{ referenceName: string; name: string }>;
}

interface WitStateEntry {
  name: string;
  color: string;           // 6-char hex without '#'
  category: string;
}

export interface WorkItemTypeMeta {
  types: Array<{ name: string; color: string; iconUrl: string }>;
  stateColors: Record<string, string>;        // stateName.toLowerCase() → '#hexcolor'
  fieldsByType: Record<string, string[]>;     // typeName → array of field reference names
}

interface ProjectEntry {
  id: string;
  name: string;
}

interface AzureQueryEntry {
  id: string;
  name: string;
  path: string;
  isFolder?: boolean;
  hasChildren?: boolean;
  queryType?: string;
  children?: AzureQueryEntry[];
}

export interface QueryTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  queryType?: 'flat' | 'tree' | 'oneHop';
  hasChildren: boolean;
  children?: QueryTreeNode[];
}

export async function validateConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }
  try {
    const client = new AdoClient(creds.token);
    const normalizedUrl = creds.orgUrl.endsWith('/') ? creds.orgUrl : `${creds.orgUrl}/`;
    const data = await client.get<{ authenticatedUser?: { subjectDescriptor?: string; providerDisplayName?: string } }>(
      `${normalizedUrl}_apis/connectionData?api-version=1.0`
    );
    res.json({
      valid: true,
      user: data.authenticatedUser?.providerDisplayName ?? data.authenticatedUser?.subjectDescriptor ?? 'authenticated',
    });
  } catch (err) {
    next(err);
  }
}

export async function getRelationTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const key = cacheKey(creds.orgUrl, 'relation-types');
  const cached = cacheGet<{ value: RelationTypeEntry[] }>(key);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const normalizedUrl = creds.orgUrl.endsWith('/') ? creds.orgUrl : `${creds.orgUrl}/`;
    const url = `${normalizedUrl}_apis/wit/workitemrelationtypes`;
    const raw = await client.get<{ value: RelationTypeEntry[] }>(url);
    // Only expose work-item link types — artifact/resource links (Hyperlink, GitHub, etc.)
    // are not valid in WIQL WorkItemLinks queries and would cause ADO 400 errors.
    // Some on-prem ADO Server versions serialize `usage` as its raw numeric enum (0)
    // instead of the Cloud API's string form ('workItemLink') — accept either.
    const workItemOnly = (raw.value ?? []).filter(
      rt => rt.attributes?.['usage'] === 'workItemLink' || rt.attributes?.['usage'] === 0
    );
    const result = { value: workItemOnly };
    cacheSet(key, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getWorkItemTypeMeta(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const project = String(req.query['project'] ?? '').trim();
  if (!project) {
    res.status(400).json({ error: 'Missing project query param' });
    return;
  }

  const key = cacheKey(creds.orgUrl, project, 'work-item-type-meta');
  const cached = cacheGet<WorkItemTypeMeta>(key);
  if (cached) { res.json(cached); return; }

  try {
    const client = new AdoClient(creds.token);
    const normalizedUrl = creds.orgUrl.endsWith('/') ? creds.orgUrl : `${creds.orgUrl}/`;
    const baseUrl = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit`;

    // Try $expand=fields first; fall back to non-expanded if server rejects it
    let types: WitTypeEntry[] = [];
    let fieldsInline = false;
    try {
      const typesResult = await client.get<{ value: WitTypeEntry[] }>(`${baseUrl}/workitemtypes?$expand=fields`);
      types = typesResult.value ?? [];
      fieldsInline = types.length > 0 && Array.isArray(types[0].fields);
    } catch {
      try {
        const typesResult = await client.get<{ value: WitTypeEntry[] }>(`${baseUrl}/workitemtypes`);
        types = typesResult.value ?? [];
      } catch (fallbackErr) {
        logger.warn('getWorkItemTypeMeta: both workitemtypes calls failed, returning empty metadata', { fallbackErr });
        // types remains [] — caller receives degraded but valid response instead of 5xx
      }
    }

    // Fetch states + (if needed) per-type fields in parallel, capped at 6 concurrent
    const stateColors: Record<string, string> = {};
    const fieldsByType: Record<string, string[]> = {};
    const CHUNK = 6;
    for (let i = 0; i < types.length; i += CHUNK) {
      await Promise.all(types.slice(i, i + CHUNK).map(async (t) => {
        try {
          const statesResult = await client.get<{ value: WitStateEntry[] }>(
            `${baseUrl}/workitemtypes/${encodeURIComponent(t.name)}/states`
          );
          for (const s of statesResult.value ?? []) {
            const k = s.name.toLowerCase();
            if (!stateColors[k] && s.color) stateColors[k] = `#${s.color}`;
          }
        } catch (stateErr) { logger.warn(`getWorkItemTypeMeta: state fetch failed for ${t.name}`, { stateErr }); }

        if (fieldsInline) {
          fieldsByType[t.name] = (t.fields ?? []).map(f => f.referenceName);
        } else {
          try {
            const fieldsResult = await client.get<{ value: Array<{ referenceName: string }> }>(
              `${baseUrl}/workitemtypes/${encodeURIComponent(t.name)}/fields`
            );
            fieldsByType[t.name] = (fieldsResult.value ?? []).map(f => f.referenceName);
          } catch (fieldsErr) { logger.warn(`getWorkItemTypeMeta: fields fetch failed for ${t.name}`, { fieldsErr }); }
        }
      }));
    }

    const result: WorkItemTypeMeta = {
      types: types.map(t => ({
        name: t.name,
        color: `#${t.color}`,
        iconUrl: t.icon?.url ?? '',
      })),
      stateColors,
      fieldsByType,
    };

    cacheSet(key, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

function mapQueryEntry(entry: AzureQueryEntry): QueryTreeNode {
  return {
    id: entry.id,
    name: entry.name,
    path: entry.path,
    isFolder: entry.isFolder ?? false,
    hasChildren: entry.hasChildren ?? false,
    queryType: entry.isFolder ? undefined : (entry.queryType as QueryTreeNode['queryType']),
    children: entry.children ? entry.children.map(mapQueryEntry) : undefined,
  };
}

export async function getQueries(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const project = String(req.query['project'] ?? '').trim();
  if (!project) {
    res.status(400).json({ error: 'Missing project query param' });
    return;
  }

  const key = cacheKey(creds.orgUrl, project, 'queries');
  const cached = cacheGet<QueryTreeNode[]>(key);
  if (cached) { res.json(cached); return; }

  try {
    const client = new AdoClient(creds.token);
    const normalizedUrl = creds.orgUrl.endsWith('/') ? creds.orgUrl : `${creds.orgUrl}/`;
    const baseUrl = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/queries`;

    const [myQueriesResult, sharedQueriesResult] = await Promise.allSettled([
      client.get<AzureQueryEntry>(`${baseUrl}/My Queries?$depth=2&$expand=all&api-version=7.1`),
      client.get<AzureQueryEntry>(`${baseUrl}/Shared Queries?$depth=2&$expand=all&api-version=7.1`),
    ]);

    const roots: QueryTreeNode[] = [];
    if (myQueriesResult.status === 'fulfilled') roots.push(mapQueryEntry(myQueriesResult.value));
    if (sharedQueriesResult.status === 'fulfilled') roots.push(mapQueryEntry(sharedQueriesResult.value));

    cacheSet(key, roots);
    res.json(roots);
  } catch (err) {
    next(err);
  }
}

export async function getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const key = cacheKey(creds.orgUrl, 'projects');
  const cached = cacheGet<{ value: ProjectEntry[] }>(key);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const normalizedUrl = creds.orgUrl.endsWith('/') ? creds.orgUrl : `${creds.orgUrl}/`;
    const url = `${normalizedUrl}_apis/projects`;
    const result = await client.get<{ value: ProjectEntry[] }>(url);
    cacheSet(key, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
