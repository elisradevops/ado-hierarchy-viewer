import type { Request, Response, NextFunction } from 'express';
import { AdoClient } from '../services/AdoClient';
import { extractCreds } from '../middleware/creds';
import { fetchLinks, fetchWorkItems, fetchQueryRootIds, classifyMissingIds, type WorkItem, type WorkItemRelation } from '../services/HierarchyService';
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
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? 'Validation error', details: parsed.error.flatten() });
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
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? 'Validation error', details: parsed.error.flatten() });
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
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const client = new AdoClient(creds.token);
    const { project, relationTypes, effortField, queryId } = parsed.data;
    const fields = [...new Set([...BASE_WI_FIELDS, effortField ?? DEFAULT_EFFORT_FIELD])];
    const resolvedEffortField = effortField ?? DEFAULT_EFFORT_FIELD;

    // The query is always the baseline — link types only extend outward from the
    // work items the query actually returned, they never seed the hierarchy on their own.
    // bypassCache=true: this endpoint backs the Refresh button/auto-refresh — a refresh
    // that can return stale cached data (e.g. still showing an item deleted seconds ago
    // until the cache's TTL naturally expires) defeats its own purpose.
    const q = await fetchQueryRootIds(client, creds.orgUrl, project, queryId, true);
    const queryRootIds = q.rootIds;
    const queryRelations = q.queryRelations;
    const matchedIds = q.matchedIds;

    // Seed = every node the query touched (roots + all relation endpoints).
    const seedIds = new Set<number>(queryRootIds);
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

    if (relationTypes.length > 0 && seedIds.size > 0) {
      // Resolve seed items up front and bucket the initial frontier by their REAL team
      // project — a cross-project (tree/oneHop) query can seed ids that don't live in
      // `project`, and WIQL's [Source].[System.TeamProject] filter would silently drop
      // their links if hop 0 assumed they were all in `project`.
      const seedItems = await fetchWorkItems(client, creds.orgUrl, project, [...seedIds], fields, resolvedEffortField, true);
      for (const item of seedItems) resolvedItemsById.set(item.id, item);
      let frontierByProject = new Map<string, number[]>();
      for (const item of seedItems) {
        if (!item.teamProject) continue;
        const bucket = frontierByProject.get(item.teamProject);
        if (bucket) bucket.push(item.id);
        else frontierByProject.set(item.teamProject, [item.id]);
      }
      for (let hop = 0; hop < MAX_PROJECT_HOPS && frontierByProject.size > 0; hop++) {
        const entries = [...frontierByProject.entries()];
        // Bounded via the same concurrency limiter used for batch work-item fetch —
        // an unusually wide frontier (many newly-discovered projects in one hop)
        // shouldn't fire unlimited concurrent requests against ADO.
        const batches = await Promise.all(
          entries.map(([p, ids]) => adoConcurrencyLimit(() => fetchLinks(client, creds.orgUrl, p, relationTypes, ids, true)))
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

        if (idsToResolve.size === 0) break;
        for (const id of idsToResolve) visitedIds.add(id);

        const newItems = await fetchWorkItems(client, creds.orgUrl, project, [...idsToResolve], fields, resolvedEffortField, true);
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
    for (const id of queryRootIds) idSet.add(id);

    const missingIds = [...idSet].filter(id => !resolvedItemsById.has(id));
    const missingItems = missingIds.length > 0
      ? await fetchWorkItems(client, creds.orgUrl, project, missingIds, fields, resolvedEffortField, true)
      : [];
    const workItems = [...resolvedItemsById.values(), ...missingItems];

    // Ids still unresolved after the second-chance batch fetch: classify why (no access vs
    // deleted) instead of surfacing a single generic "missing" placeholder to the user.
    const missingItemIds = new Set(missingItems.map(item => item.id));
    const stillMissingIds = missingIds.filter(id => !missingItemIds.has(id));
    const missingIdReasons = stillMissingIds.length > 0
      ? await classifyMissingIds(client, creds.orgUrl, project, stillMissingIds)
      : new Map();

    res.json({
      workItemRelations: relations,
      workItems,
      rootIds: queryRootIds,
      matchedIds,
      missingIdReasons: Object.fromEntries(missingIdReasons),
    });
  } catch (err) {
    next(err);
  }
}
