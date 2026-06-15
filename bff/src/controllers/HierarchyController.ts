import type { Request, Response, NextFunction } from 'express';
import { AdoClient } from '../services/AdoClient';
import { extractCreds } from '../middleware/creds';
import { fetchLinks, fetchWorkItems } from '../services/HierarchyService';
import {
  LinksRequestSchema,
  WorkItemsRequestSchema,
  HierarchyRequestSchema,
} from '../schemas/hierarchy.schema';

const DEFAULT_EFFORT_FIELD = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const BASE_WI_FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.TeamProject',
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
      parsed.data.relationType,
      parsed.data.direction
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
    const { project, relationType, direction, effortField } = parsed.data;
    const fields = [...BASE_WI_FIELDS, effortField ?? DEFAULT_EFFORT_FIELD];

    const relations = await fetchLinks(client, creds.orgUrl, project, relationType, direction);
    const uniqueIds = [
      ...new Set([
        ...relations.filter(r => r.source).map(r => r.source!.id),
        ...relations.filter(r => r.target).map(r => r.target!.id),
      ]),
    ];

    const workItems = await fetchWorkItems(client, creds.orgUrl, project, uniqueIds, fields);
    res.json({ workItemRelations: relations, workItems });
  } catch (err) {
    next(err);
  }
}
