import type { Request, Response, NextFunction } from 'express';
import { AdoClient } from '../services/AdoClient';
import { extractCreds } from '../middleware/creds';
import { cacheGet, cacheSet } from '../services/cache';
import { cacheKey } from '../utils/hash';

interface RelationTypeEntry {
  referenceName: string;
  name: string;
  attributes?: Record<string, unknown>;
}

interface WitTypeEntry {
  name: string;
  color: string;           // 6-char hex without '#'
  icon?: { id: string; url: string };
}

interface WitStateEntry {
  name: string;
  color: string;           // 6-char hex without '#'
  category: string;
}

export interface WorkItemTypeMeta {
  types: Array<{ name: string; color: string; iconUrl: string }>;
  stateColors: Record<string, string>;  // stateName.toLowerCase() → '#hexcolor'
}

interface ProjectEntry {
  id: string;
  name: string;
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
    const result = await client.get<{ value: RelationTypeEntry[] }>(url);
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

    const typesResult = await client.get<{ value: WitTypeEntry[] }>(`${baseUrl}/workitemtypes`);
    const types = typesResult.value ?? [];

    // Fetch states per type in parallel, capped at 6 concurrent to avoid ADO rate limiting
    const stateColors: Record<string, string> = {};
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
        } catch { /* skip — individual type failure is non-fatal */ }
      }));
    }

    const result: WorkItemTypeMeta = {
      types: types.map(t => ({
        name: t.name,
        color: `#${t.color}`,
        iconUrl: t.icon?.url ?? '',
      })),
      stateColors,
    };

    cacheSet(key, result);
    res.json(result);
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
