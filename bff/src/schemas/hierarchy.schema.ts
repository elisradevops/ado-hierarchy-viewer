import { z } from 'zod';

export const LinksRequestSchema = z.object({
  project: z.string().min(1),
  relationTypes: z.array(z.string().min(1)).min(1),
});

export const WorkItemsRequestSchema = z.object({
  project: z.string().min(1),
  ids: z.array(z.number().int().positive()).min(1).max(10000),
  fields: z.array(z.string().min(1)).min(1),
});

export const HierarchyRequestSchema = z.object({
  project: z.string().min(1),
  relationTypes: z.array(z.string().min(1)).default([]),
  closedState: z.string().min(1).default('Closed'),
  effortField: z.string().min(1).default('Microsoft.VSTS.Scheduling.OriginalEstimate'),
  queryId: z.string().optional().default(''),
});

export type LinksRequest  = z.infer<typeof LinksRequestSchema>;
export type WorkItemsRequest = z.infer<typeof WorkItemsRequestSchema>;
export type HierarchyRequest = z.infer<typeof HierarchyRequestSchema>;
