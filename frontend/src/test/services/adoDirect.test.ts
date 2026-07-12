/**
 * Unit tests for adoDirect.ts — SDK REST client path (extension mode).
 * getClient() is mocked so no real SDK/ADO calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared stub state ──────────────────────────────────────────────────────
const witStub = {
  getRelationTypes: vi.fn(),
  getWorkItemTypes: vi.fn(),
  queryByWiql: vi.fn(),
  queryById: vi.fn(),
  getWorkItemsBatch: vi.fn(),
  getWorkItem: vi.fn(),
  getQueries: vi.fn(),
  getQuery: vi.fn(),
};
const coreStub = {
  getProjects: vi.fn(),
};

vi.mock('azure-devops-extension-api', () => ({
  getClient: vi.fn((ClientClass: unknown) => {
    // CoreRestClient → coreStub; anything else → witStub
    const name = (ClientClass as { name?: string }).name ?? '';
    return name === 'CoreRestClient' ? coreStub : witStub;
  }),
}));

vi.mock('azure-devops-extension-api/WorkItemTracking', async () => {
  const actual = await vi.importActual<typeof import('azure-devops-extension-api/WorkItemTracking')>(
    'azure-devops-extension-api/WorkItemTracking'
  );
  return {
    ...actual,
    WorkItemTrackingRestClient: class WorkItemTrackingRestClient {},
    QueryExpand: { All: 3 },
    WorkItemErrorPolicy: { Omit: 2 },
    WorkItemBatchGetRequest: {},
  };
});

vi.mock('azure-devops-extension-api/Core', () => ({
  CoreRestClient: class CoreRestClient {},
}));

const sdkWebContext = { project: { id: 'proj-1', name: 'Alpha' } };
vi.mock('azure-devops-extension-sdk', () => ({
  getWebContext: vi.fn(() => sdkWebContext),
}));

import {
  fetchRelationTypesDirect,
  fetchProjectsDirect,
  fetchWorkItemTypeMetaDirect,
  fetchRelationsDirect,
  fetchQueriesDirect,
  fetchQueryRootIdsDirect,
  fetchHierarchyDirect,
  classifyMissingIdsDirect,
} from '../../api/adoDirect';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── fetchRelationTypesDirect ───────────────────────────────────────────────

describe('fetchRelationTypesDirect', () => {
  it('gap #1: filters out non-workItemLink types', async () => {
    witStub.getRelationTypes.mockResolvedValue([
      { referenceName: 'System.LinkTypes.Hierarchy-Forward', name: 'Child', attributes: { usage: 'workItemLink' } },
      { referenceName: 'ArtifactLink', name: 'Artifact', attributes: { usage: 'resourceLink' } },
      { referenceName: 'Hyperlink', name: 'Hyperlink', attributes: {} },
    ]);
    const result = await fetchRelationTypesDirect('', '');
    expect(result).toHaveLength(1);
    expect((result[0] as { referenceName: string }).referenceName).toBe('System.LinkTypes.Hierarchy-Forward');
  });

  it('accepts numeric usage (some on-prem ADO Server versions serialize the enum as 0/1 instead of strings)', async () => {
    witStub.getRelationTypes.mockResolvedValue([
      { referenceName: 'System.LinkTypes.Hierarchy-Forward', name: 'Child', attributes: { usage: 0 } },
      { referenceName: 'ArtifactLink', name: 'Artifact', attributes: { usage: 1 } },
    ]);
    const result = await fetchRelationTypesDirect('', '');
    expect(result).toHaveLength(1);
    expect((result[0] as { referenceName: string }).referenceName).toBe('System.LinkTypes.Hierarchy-Forward');
  });

  it('returns empty when signal already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await fetchRelationTypesDirect('', '', ctrl.signal);
    expect(result).toEqual([]);
    expect(witStub.getRelationTypes).not.toHaveBeenCalled();
  });

  it('dispatches auth-unauthorized on 401 and rethrows', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    witStub.getRelationTypes.mockRejectedValue(err);
    const eventFired = vi.fn();
    window.addEventListener('auth-unauthorized', eventFired);
    await expect(fetchRelationTypesDirect('', '')).rejects.toThrow('Unauthorized');
    expect(eventFired).toHaveBeenCalledTimes(1);
    window.removeEventListener('auth-unauthorized', eventFired);
  });
});

// ── fetchProjectsDirect ────────────────────────────────────────────────────

describe('fetchProjectsDirect', () => {
  it('returns current project from SDK web context (no REST call)', async () => {
    const result = await fetchProjectsDirect('', '');
    expect(result).toEqual([{ id: 'proj-1', name: 'Alpha' }]);
    expect(coreStub.getProjects).not.toHaveBeenCalled();
  });

  it('returns empty on aborted signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await fetchProjectsDirect('', '', ctrl.signal)).toEqual([]);
    expect(coreStub.getProjects).not.toHaveBeenCalled();
  });
});

// ── fetchWorkItemTypeMetaDirect ────────────────────────────────────────────

describe('fetchWorkItemTypeMetaDirect', () => {
  it('gap #2: builds fieldsByType from WorkItemType.fields', async () => {
    witStub.getWorkItemTypes.mockResolvedValue([
      {
        name: 'Task',
        color: 'f2cb1d',
        icon: { url: 'https://icon.url/task' },
        states: [{ name: 'Active', color: '339933', category: 'InProgress' }],
        fields: [
          { referenceName: 'System.Id', name: 'ID' },
          { referenceName: 'System.Title', name: 'Title' },
        ],
      },
    ]);
    const result = await fetchWorkItemTypeMetaDirect('', '', 'MyProject');
    expect(result.types).toHaveLength(1);
    expect(result.types[0]).toMatchObject({ name: 'Task', color: '#f2cb1d', iconUrl: 'https://icon.url/task' });
    expect(result.stateColors['active']).toBe('#339933');
    expect(result.fieldsByType['Task']).toContain('System.Id');
    expect(result.fieldsByType['Task']).toContain('System.Title');
  });

  it('falls back to fieldInstances when fields absent', async () => {
    witStub.getWorkItemTypes.mockResolvedValue([
      {
        name: 'Bug',
        color: 'cc293d',
        states: [],
        fieldInstances: [{ referenceName: 'System.Id', name: 'ID' }],
      },
    ]);
    const result = await fetchWorkItemTypeMetaDirect('', '', 'MyProject');
    expect(result.fieldsByType['Bug']).toContain('System.Id');
  });

  it('returns degraded empty response on error', async () => {
    witStub.getWorkItemTypes.mockRejectedValue(new Error('ADO down'));
    await expect(fetchWorkItemTypeMetaDirect('', '', 'MyProject')).rejects.toThrow('ADO down');
  });

  it('returns empty on aborted signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await fetchWorkItemTypeMetaDirect('', '', 'MyProject', ctrl.signal);
    expect(result).toEqual({ types: [], stateColors: {}, fieldsByType: {} });
  });
});

// ── fetchRelationsDirect ───────────────────────────────────────────────────

describe('fetchRelationsDirect', () => {
  it('gap #3: returns empty without calling ADO when relationTypes is empty', async () => {
    const result = await fetchRelationsDirect('', '', 'MyProject', []);
    expect(result).toEqual([]);
    expect(witStub.queryByWiql).not.toHaveBeenCalled();
  });

  it('filters out null source/target pairs', async () => {
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 } },
        { rel: null, source: null, target: { id: 3 } },
        { rel: 'Child', source: { id: 4 }, target: null },
      ],
    });
    const result = await fetchRelationsDirect('', '', 'MyProject', ['System.LinkTypes.Hierarchy-Forward']);
    expect(result).toHaveLength(1);
    expect(result[0].source?.id).toBe(1);
    expect(result[0].target?.id).toBe(2);
  });
});

// ── fetchQueriesDirect ─────────────────────────────────────────────────────

describe('fetchQueriesDirect', () => {
  it('maps SDK QueryHierarchyItem to QueryTreeNode', async () => {
    witStub.getQueries.mockResolvedValue([
      {
        id: 'folder-1', name: 'My Queries', path: '/', isFolder: true, hasChildren: true,
        children: [
          { id: 'q-1', name: 'Active Bugs', path: '/Active Bugs', isFolder: false, hasChildren: false, queryType: 'flat' },
        ],
      },
    ]);
    const result = await fetchQueriesDirect('', '', 'MyProject');
    expect(result).toHaveLength(1);
    expect(result[0].isFolder).toBe(true);
    expect(result[0].children?.[0]).toMatchObject({ id: 'q-1', name: 'Active Bugs', queryType: 'flat' });
  });
});

// ── fetchQueryRootIdsDirect ────────────────────────────────────────────────

describe('fetchQueryRootIdsDirect', () => {
  it('extracts flat query work item IDs', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1, // QueryType.Flat = 1
      workItems: [{ id: 10 }, { id: 20 }],
      workItemRelations: [],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.rootIds).toEqual([10, 20]);
    expect(result.queryRelations).toEqual([]);
  });

  it('flat query: matchedIds equals rootIds directly, no getQuery call', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1, // QueryType.Flat = 1
      workItems: [{ id: 10 }, { id: 20 }],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.matchedIds).toEqual([10, 20]);
    expect(witStub.getQuery).not.toHaveBeenCalled();
  });

  it('tree query: fetches query definition and unions sourceClauses/targetClauses matches', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 2, // QueryType.Tree = 2
      workItemRelations: [
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 1 }, target: { id: 3 } },
      ],
    });
    witStub.getQuery.mockResolvedValue({
      queryType: 2,
      sourceClauses: {
        clauses: [], field: { name: 'Work Item Type', referenceName: 'System.WorkItemType' },
        fieldValue: null, isFieldValue: false, logicalOperator: 1 /* AND */,
        operator: { name: 'Equals', referenceName: 'SupportedOperations.Equals' }, value: 'Task',
      },
      targetClauses: {
        clauses: [], field: { name: 'State', referenceName: 'System.State' },
        fieldValue: null, isFieldValue: false, logicalOperator: 1,
        operator: { name: 'Equals', referenceName: 'SupportedOperations.Equals' }, value: 'Active',
      },
    });
    witStub.queryByWiql
      .mockResolvedValueOnce({ workItems: [{ id: 1 }] }) // sourceClauses bucket
      .mockResolvedValueOnce({ workItems: [{ id: 2 }] }); // targetClauses bucket

    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');

    expect(result.matchedIds?.sort()).toEqual([1, 2]);
    expect(witStub.getQuery).toHaveBeenCalledWith('Proj', 'query-guid', 3 /* QueryExpand.All */);
  });

  it('tree query: matchedIds is null when getQuery fails', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 2,
      workItemRelations: [{ source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getQuery.mockRejectedValue(new Error('definition fetch failed'));

    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');

    expect(result.matchedIds).toBeNull();
  });

  it('tree query: matchedIds is null when the query mode is DoesNotContain', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 2,
      workItemRelations: [{ source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getQuery.mockResolvedValue({
      queryType: 2,
      filterOptions: 6, // LinkQueryMode.LinksRecursiveDoesNotContain
      sourceClauses: {
        clauses: [], field: { name: 'Work Item Type', referenceName: 'System.WorkItemType' },
        fieldValue: null, isFieldValue: false, logicalOperator: 1,
        operator: { name: 'Equals', referenceName: 'SupportedOperations.Equals' }, value: 'Task',
      },
    });

    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');

    expect(result.matchedIds).toBeNull();
    expect(witStub.queryByWiql).not.toHaveBeenCalled();
  });

  it('extracts tree query root IDs (source not in target set)', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 2, // QueryType.Tree = 2
      workItemRelations: [
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 2 }, target: { id: 3 } },
      ],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.rootIds).toEqual([1]); // 2 is a child; only 1 is a root
    expect(result.queryRelations).toHaveLength(2);
    expect(result.queryRelations[0]).toMatchObject({ origin: 'query' });
  });

  it('extracts oneHop ("Direct Links") root IDs via null-source markers', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 3, // QueryType.OneHop = 3
      workItemRelations: [
        { source: null, target: { id: 1 } },
        { rel: 'System.LinkTypes.Related', source: { id: 1 }, target: { id: 2 } },
        { source: null, target: { id: 3 } },
      ],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.rootIds).toEqual([1, 3]);
    expect(result.queryRelations).toEqual([
      { rel: 'System.LinkTypes.Related', source: { id: 1 }, target: { id: 2 }, origin: 'query' },
    ]);
  });

  it('extracts the query\'s own columns (mirrors BFF QueryRootsResult.queryColumns)', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1,
      workItems: [{ id: 10 }],
      columns: [
        { referenceName: 'System.Title', name: 'Title' },
        { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
      ],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.queryColumns).toEqual([
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
    ]);
  });

  it('returns an empty queryColumns array when the SDK result has none', async () => {
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 10 }] });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result.queryColumns).toEqual([]);
  });
});

// ── fetchHierarchyDirect ───────────────────────────────────────────────────

describe('fetchHierarchyDirect', () => {
  it('gap #3: skips WIQL when relationTypes empty, still fetches workItems for rootIds', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1, // QueryType.Flat = 1
      workItems: [{ id: 99 }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([
      { id: 99, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Root', 'System.State': 'Active', 'System.TeamProject': 'Proj' }, url: '' },
    ]);
    const config = {
      teamProject: 'Proj', relationTypes: [], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');
    expect(result.workItemRelations).toEqual([]);
    expect(witStub.queryByWiql).not.toHaveBeenCalled();
    expect(result.workItems[0].id).toBe(99);
  });

  it('gap #4: uses DEFAULT_EFFORT_FIELD when effortField is empty', async () => {
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 1 }] }); // Flat query, root id 1
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [{ rel: 'Child', source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([]);
    const config = {
      teamProject: 'Proj', relationTypes: ['Child'], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    await fetchHierarchyDirect(config, '', '');
    const batchCall = witStub.getWorkItemsBatch.mock.calls[0]?.[0] as { fields: string[] } | undefined;
    expect(batchCall?.fields).toContain('Microsoft.VSTS.Scheduling.OriginalEstimate');
  });

  it('gap #5: includes CompletedWork in the fields list', async () => {
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 1 }] }); // Flat query, root id 1
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [{ rel: 'Child', source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([]);
    const config = {
      teamProject: 'Proj', relationTypes: ['Child'], queryId: 'q-guid',
      effortField: 'Microsoft.VSTS.Scheduling.OriginalEstimate', closedState: 'Closed', topLevelType: '',
    };
    await fetchHierarchyDirect(config, '', '');
    const batchCall = witStub.getWorkItemsBatch.mock.calls[0]?.[0] as { fields: string[] } | undefined;
    expect(batchCall?.fields).toContain('Microsoft.VSTS.Scheduling.CompletedWork');
  });

  it('unions the query\'s own columns into the requested fields and surfaces custom values via extraFields', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1, // Flat
      workItems: [{ id: 1 }],
      columns: [{ referenceName: 'Custom.RiskLevel', name: 'Risk Level' }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([
      {
        id: 1,
        fields: {
          'System.WorkItemType': 'Task', 'System.Title': 'T1', 'System.State': 'Active', 'System.TeamProject': 'Proj',
          'Custom.RiskLevel': 'High',
        },
      },
    ]);
    const config = {
      teamProject: 'Proj', relationTypes: [], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');

    const batchCall = witStub.getWorkItemsBatch.mock.calls[0]?.[0] as { fields: string[] } | undefined;
    expect(batchCall?.fields).toContain('Custom.RiskLevel');
    expect(result.queryColumns).toEqual([{ referenceName: 'Custom.RiskLevel', name: 'Risk Level' }]);
    expect(result.workItems[0].extraFields).toEqual({ 'Custom.RiskLevel': 'High' });
  });

  it('excludes the configured effort field from extraFields even when it is also one of the query\'s own columns', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 1,
      workItems: [{ id: 1 }],
      columns: [{ referenceName: 'Custom.Effort', name: 'Effort' }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([
      {
        id: 1,
        fields: {
          'System.WorkItemType': 'Task', 'System.Title': 'T1', 'System.State': 'Active', 'System.TeamProject': 'Proj',
          'Custom.Effort': 5,
        },
      },
    ]);
    const config = {
      teamProject: 'Proj', relationTypes: [], queryId: 'q-guid',
      effortField: 'Custom.Effort', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');

    expect(result.workItems[0].effort).toBe(5);
    expect(result.workItems[0].extraFields).toBeUndefined();
  });

  it('merges query-native edges with link edges, query wins on the same pair', async () => {
    // Tree query: 1 -> 2 (native structure)
    witStub.queryById.mockResolvedValue({
      queryType: 2, // QueryType.Tree = 2
      workItemRelations: [{ source: { id: 1 }, target: { id: 2 } }],
    });
    // Link-type fetch discovers the SAME pair 1->2 (should be overridden by query origin), plus a new pair 2->3
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [
        { rel: 'X', source: { id: 1 }, target: { id: 2 } },
        { rel: 'X', source: { id: 2 }, target: { id: 3 } },
      ],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([
      { id: 1, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'E', 'System.State': 'Active', 'System.TeamProject': 'Proj' } },
      { id: 2, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'F', 'System.State': 'Active', 'System.TeamProject': 'Proj' } },
      { id: 3, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'T', 'System.State': 'Active', 'System.TeamProject': 'Proj' } },
    ]);

    const config = {
      teamProject: 'Proj', relationTypes: ['X'], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');

    const pair12 = result.workItemRelations.find(r => r.source?.id === 1 && r.target?.id === 2);
    const pair23 = result.workItemRelations.find(r => r.source?.id === 2 && r.target?.id === 3);
    expect(pair12?.origin).toBe('query');
    expect(pair23?.origin).toBe('link');
    expect(result.workItems.map(w => w.id).sort()).toEqual([1, 2, 3]);
  });

  it('follows links across projects when a discovered work item belongs to a different project', async () => {
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 1 }] }); // Flat query, root id 1
    // Hop 1: 'Proj' has a link from item 1 (Proj) to item 2 (OtherProj)
    witStub.queryByWiql
      .mockResolvedValueOnce({
        workItemRelations: [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }],
      })
      // Hop 2: OtherProj's own outgoing link, from item 2 to item 3 (also OtherProj)
      .mockResolvedValueOnce({
        workItemRelations: [{ rel: 'X', source: { id: 2 }, target: { id: 3 } }],
      })
      // Hop 3: id-scoped BFS asks once more from item 3 before finding nothing new and stopping.
      .mockResolvedValue({ workItemRelations: [] });

    // Only returns items for ids actually requested — mirrors real getWorkItemsBatch and
    // avoids leaking the already-visited seed id (1) back into the next hop's frontier.
    const itemsById: Record<number, { id: number; fields: Record<string, string> }> = {
      1: { id: 1, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'E', 'System.State': 'Active', 'System.TeamProject': 'Proj' } },
      2: { id: 2, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'F', 'System.State': 'Active', 'System.TeamProject': 'OtherProj' } },
      3: { id: 3, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'T', 'System.State': 'Active', 'System.TeamProject': 'OtherProj' } },
    };
    witStub.getWorkItemsBatch.mockImplementation(async (req: { ids: number[] }) =>
      req.ids.map(id => itemsById[id])
    );

    const config = {
      teamProject: 'Proj', relationTypes: ['X'], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');

    // Id-scoped BFS: hop1 (seed [1]) -> discovers 2 (OtherProj); hop2 ([2]) -> discovers 3;
    // hop3 ([3]) finds nothing new and stops.
    expect(witStub.queryByWiql).toHaveBeenCalledTimes(3);
    expect(result.workItems.map(w => w.id).sort()).toEqual([1, 2, 3]);
    expect(result.workItemRelations).toHaveLength(2);
  });

  it('buckets the initial link-follow frontier by the seed item\'s real project, not config.teamProject', async () => {
    // Query root id 1 lives in "OtherProj", not config.teamProject ("Proj") — this
    // happens with cross-project (tree/oneHop) queries. The BFS must query links
    // scoped to "OtherProj" (where 1 actually lives), not "Proj".
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 1 }] }); // Flat query, root id 1
    witStub.getWorkItemsBatch.mockResolvedValueOnce([
      { id: 1, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'T1', 'System.State': 'Active', 'System.TeamProject': 'OtherProj' } },
    ]);
    witStub.queryByWiql.mockResolvedValueOnce({ workItemRelations: [] }); // no further links, just verify call scoping

    const config = {
      teamProject: 'Proj', relationTypes: ['X'], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    await fetchHierarchyDirect(config, '', '');

    expect(witStub.queryByWiql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("[Source].[System.TeamProject] = 'OtherProj'"),
      }),
      'OtherProj' // not 'Proj' — scoped to where the seed item actually lives
    );
  });

  it('perf: batch-fetches ids in concurrent chunks and merges every chunk\'s results (was serial)', async () => {
    // 251 distinct ids (source 1 + targets 2..251) → ceil(251/BATCH_SIZE=200) = 2 chunks.
    const CHILD_COUNT = 250;
    const relations = Array.from({ length: CHILD_COUNT }, (_, i) => ({
      rel: 'Child', source: { id: 1 }, target: { id: i + 2 },
    }));
    witStub.queryById.mockResolvedValue({ queryType: 1, workItems: [{ id: 1 }] }); // Flat query, root id 1
    witStub.queryByWiql.mockResolvedValue({ workItemRelations: relations });
    witStub.getWorkItemsBatch.mockImplementation(async (req: { ids: number[] }) =>
      req.ids.map(id => ({
        id,
        fields: { 'System.WorkItemType': 'Task', 'System.Title': `Item ${id}`, 'System.State': 'Active', 'System.TeamProject': 'Proj' },
        url: '',
      }))
    );

    const config = {
      teamProject: 'Proj', relationTypes: ['Child'], queryId: 'q-guid',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    const result = await fetchHierarchyDirect(config, '', '');

    // 1 call resolves the seed root id (1) up front to bucket the frontier by its real
    // project; 2 more calls resolve the 250 discovered children (chunked at BATCH_SIZE=200).
    expect(witStub.getWorkItemsBatch).toHaveBeenCalledTimes(3);
    // All ids across both chunks must be present — no drops from parallelizing the loop.
    expect(result.workItems).toHaveLength(CHILD_COUNT + 1);
    expect(new Set(result.workItems.map(w => w.id)).size).toBe(CHILD_COUNT + 1);
  });
});

// ── classifyMissingIdsDirect parity ─────────────────────────────────────────
//
// Mirrors bff/src/test/HierarchyService.test.ts "classifyMissingIds" 1:1 (same
// status codes, same expected reasons) so a change to either side's status→reason
// table shows up as a failing test instead of silent drift between the two
// independently-implemented BFS/classification paths (extension vs standalone).

describe('classifyMissingIdsDirect parity (mirrors BFF classifyMissingIds)', () => {
  it('returns an empty map for an empty id list without calling getWorkItem', async () => {
    const result = await classifyMissingIdsDirect('Proj', []);
    expect(result).toEqual({});
    expect(witStub.getWorkItem).not.toHaveBeenCalled();
  });

  it('classifies a 403 error as restricted', async () => {
    witStub.getWorkItem.mockRejectedValue({ status: 403 });
    const result = await classifyMissingIdsDirect('Proj', [1]);
    expect(result[1]).toBe('restricted');
  });

  it('classifies a 401 error as restricted', async () => {
    witStub.getWorkItem.mockRejectedValue({ status: 401 });
    const result = await classifyMissingIdsDirect('Proj', [1]);
    expect(result[1]).toBe('restricted');
  });

  it('classifies a 404 error as deleted', async () => {
    witStub.getWorkItem.mockRejectedValue({ status: 404 });
    const result = await classifyMissingIdsDirect('Proj', [2]);
    expect(result[2]).toBe('deleted');
  });

  it('classifies an unexpected error status as missing', async () => {
    witStub.getWorkItem.mockRejectedValue({ status: 500 });
    const result = await classifyMissingIdsDirect('Proj', [3]);
    expect(result[3]).toBe('missing');
  });

  it('classifies an id that resolves in isolation as missing (transient batch omission)', async () => {
    witStub.getWorkItem.mockResolvedValue({ id: 4 });
    const result = await classifyMissingIdsDirect('Proj', [4]);
    expect(result[4]).toBe('missing');
  });
});
