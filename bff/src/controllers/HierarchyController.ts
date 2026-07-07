import type { Request, Response, NextFunction } from 'express';
import { AdoClient } from '../services/AdoClient';
import { extractCreds } from '../middleware/creds';
import { fetchLinks, fetchWorkItems, fetchQueryRootIds, type WorkItem, type WorkItemRelation } from '../services/HierarchyService';
import { adoConcurrencyLimit } from '../utils/queue';
import {
  LinksRequestSchema,
  WorkItemsRequestSchema,
  HierarchyRequestSchema,
} from '../schemas/hierarchy.schema';

const DEFAULT_EFFORT_FIELD = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
// Bounds the cross-project link-following BFS so a pathological/cyclic collection can't hang a request.
const MAX_PROJECT_HOPS = 15;
const BASE_WI_FIELDS = [
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
];

export async function postLinks(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const parsed = LinksRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const relations = await fetchLinks(
      client,
      creds.orgUrl,
      parsed.data.project,
      parsed.data.relationTypes
    );
    res.json({ workItemRelations: relations });
  } catch (err) {
    next(err);
  }
}

export async function postWorkItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const parsed = WorkItemsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const { ids, fields, project } = parsed.data;
    const workItems = await fetchWorkItems(
      client,
      creds.orgUrl,
      project,
      ids,
      fields
    );
    res.json({ workItems });
  } catch (err) {
    next(err);
  }
}

export async function postHierarchy(req: Request, res: Response, next: NextFunction): Promise<void> {
  const creds = extractCreds(req);
  if (!creds) {
    res.status(400).json({ error: 'Missing X-Ado-Org-Url or X-Ado-PAT headers' });
    return;
  }

  const parsed = HierarchyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const { project, relationTypes, effortField, queryId } = parsed.data;
    const fields = [...new Set([...BASE_WI_FIELDS, effortField ?? DEFAULT_EFFORT_FIELD])];
    const resolvedEffortField = effortField ?? DEFAULT_EFFORT_FIELD;

    let queryRootIds: number[] | undefined;
    let queryRelations: WorkItemRelation[] = [];
    let matchedIds: number[] | null = null;
    if (queryId) {
      const q = await fetchQueryRootIds(client, creds.orgUrl, project, queryId);
      queryRootIds = q.rootIds;
      queryRelations = q.queryRelations;
      matchedIds = q.matchedIds;
    }

    // Cross-project recursive link-follow: start from `project`, and whenever a newly
    // resolved work item belongs to a project we haven't queried yet, fetch that
    // project's own links too. Bounded by MAX_PROJECT_HOPS + shrinking frontier.
    const linkRelationsByPair = new Map<string, WorkItemRelation>();
    const resolvedItemsById = new Map<number, WorkItem>();
    const knownProjects = new Set<string>([project]);

    if (relationTypes.length > 0) {
      let frontier = [project];
      for (let hop = 0; hop < MAX_PROJECT_HOPS && frontier.length > 0; hop++) {
        // Bounded via the same concurrency limiter used for batch work-item fetch —
        // an unusually wide frontier (many newly-discovered projects in one hop)
        // shouldn't fire unlimited concurrent requests against ADO.
        const batches = await Promise.all(
          frontier.map(p => adoConcurrencyLimit(() => fetchLinks(client, creds.orgUrl, p, relationTypes)))
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

        if (idsToResolve.size === 0) break;

        const newItems = await fetchWorkItems(client, creds.orgUrl, project, [...idsToResolve], fields, resolvedEffortField);
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
    for (const id of (queryRootIds ?? [])) idSet.add(id);

    const missingIds = [...idSet].filter(id => !resolvedItemsById.has(id));
    const missingItems = missingIds.length > 0
      ? await fetchWorkItems(client, creds.orgUrl, project, missingIds, fields, resolvedEffortField)
      : [];
    const workItems = [...resolvedItemsById.values(), ...missingItems];

    res.json({ workItemRelations: relations, workItems, rootIds: queryRootIds, matchedIds });
  } catch (err) {
    next(err);
  }
}
