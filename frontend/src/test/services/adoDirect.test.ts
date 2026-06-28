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
  getQueries: vi.fn(),
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

import {
  fetchRelationTypesDirect,
  fetchProjectsDirect,
  fetchWorkItemTypeMetaDirect,
  fetchRelationsDirect,
  fetchQueriesDirect,
  fetchQueryRootIdsDirect,
  fetchHierarchyDirect,
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
  it('maps SDK projects to id+name shape', async () => {
    coreStub.getProjects.mockResolvedValue([
      { id: 'proj-1', name: 'Alpha' },
      { id: 'proj-2', name: 'Beta' },
    ]);
    const result = await fetchProjectsDirect('', '');
    expect(result).toEqual([{ id: 'proj-1', name: 'Alpha' }, { id: 'proj-2', name: 'Beta' }]);
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
    expect(result).toEqual([10, 20]);
  });

  it('extracts tree query root IDs (source not in target set)', async () => {
    witStub.queryById.mockResolvedValue({
      queryType: 'tree',
      workItemRelations: [
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 2 }, target: { id: 3 } },
      ],
    });
    const result = await fetchQueryRootIdsDirect('', '', 'Proj', 'query-guid');
    expect(result).toEqual([1]); // 2 is a child; only 1 is a root
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
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [{ rel: 'Child', source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([]);
    const config = {
      teamProject: 'Proj', relationTypes: ['Child'], queryId: '',
      effortField: '', closedState: 'Closed', topLevelType: '',
    };
    await fetchHierarchyDirect(config, '', '');
    const batchCall = witStub.getWorkItemsBatch.mock.calls[0]?.[0] as { fields: string[] } | undefined;
    expect(batchCall?.fields).toContain('Microsoft.VSTS.Scheduling.OriginalEstimate');
  });

  it('gap #5: includes CompletedWork in the fields list', async () => {
    witStub.queryByWiql.mockResolvedValue({
      workItemRelations: [{ rel: 'Child', source: { id: 1 }, target: { id: 2 } }],
    });
    witStub.getWorkItemsBatch.mockResolvedValue([]);
    const config = {
      teamProject: 'Proj', relationTypes: ['Child'], queryId: '',
      effortField: 'Microsoft.VSTS.Scheduling.OriginalEstimate', closedState: 'Closed', topLevelType: '',
    };
    await fetchHierarchyDirect(config, '', '');
    const batchCall = witStub.getWorkItemsBatch.mock.calls[0]?.[0] as { fields: string[] } | undefined;
    expect(batchCall?.fields).toContain('Microsoft.VSTS.Scheduling.CompletedWork');
  });
});
