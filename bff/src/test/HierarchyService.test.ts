import { fetchLinks, fetchWorkItems, fetchQueryRootIds, classifyMissingIds } from '../services/HierarchyService';
import { AdoClient } from '../services/AdoClient';
import * as cache from '../services/cache';

// Mock AdoClient entirely — we don't want real HTTP
jest.mock('../services/AdoClient');
// Mock cache so we control hits/misses
jest.mock('../services/cache');

const MockedAdoClient = AdoClient as jest.MockedClass<typeof AdoClient>;
const mockedCacheGet = cache.cacheGet as jest.MockedFunction<typeof cache.cacheGet>;
const mockedCacheSet = cache.cacheSet as jest.MockedFunction<typeof cache.cacheSet>;

function makeClient(): AdoClient {
  return new MockedAdoClient('dummy-token');
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: cache always misses unless overridden in a specific test
  mockedCacheGet.mockReturnValue(undefined);
});

// ─── fetchLinks ────────────────────────────────────────────────────────────────

describe('fetchLinks', () => {
  it('returns filtered relations (nulls removed)', async () => {
    const client = makeClient();
    const rawRelations = [
      { rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 } },
      { rel: null, source: null, target: { id: 3 } },           // source null → filtered
      { rel: null, source: { id: 4 }, target: null },           // target null → filtered
      { rel: 'X', source: { id: 5 }, target: { id: 6 } },
    ];

    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: rawRelations });

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['System.LinkTypes.Hierarchy-Forward']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 } });
    expect(result[1]).toEqual({ rel: 'X', source: { id: 5 }, target: { id: 6 } });
  });

  it('returns cached value without calling AdoClient.post', async () => {
    const client = makeClient();
    const cached = [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }];
    mockedCacheGet.mockReturnValue(cached);

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X']);

    expect(result).toBe(cached);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('bypassCache=true skips the cache and hits AdoClient.post even when a cached value exists', async () => {
    // Regression test: the Refresh button (postHierarchy) must see a just-deleted item
    // disappear from ADO's link results immediately, not only after the cache's TTL
    // naturally expires — bypassCache is how it forces a real network round-trip.
    const client = makeClient();
    const cached = [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }];
    mockedCacheGet.mockReturnValue(cached);
    const fresh = [{ rel: 'X', source: { id: 1 }, target: { id: 3 } }];
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: fresh });

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X'], undefined, true);

    expect(result).toEqual(fresh);
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('coalesces two concurrent bypassCache calls with identical params into one AdoClient.post call', async () => {
    // Optimization: bypassCache correctly forces freshness, but without coalescing, two
    // near-simultaneous refreshes (e.g. two browser tabs) would each fire a full ADO
    // round-trip. Single-flight collapses them into one call — both still get the fresh result.
    const client = makeClient();
    mockedCacheGet.mockReturnValue(undefined);
    const fresh = [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }];
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: fresh });

    const [a, b] = await Promise.all([
      fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X'], undefined, true),
      fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X'], undefined, true),
    ]);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(a).toEqual(fresh);
    expect(b).toEqual(fresh);
  });

  it('stores result in cache after a successful fetch', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      workItemRelations: [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }],
    });

    await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X']);

    expect(mockedCacheSet).toHaveBeenCalledTimes(1);
  });

  it('handles empty workItemRelations gracefully', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: [] });

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X']);

    expect(result).toEqual([]);
  });

  it('handles missing workItemRelations key gracefully', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', ['X']);

    expect(result).toEqual([]);
  });

  it('normalizes orgUrl trailing slash', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: [] });

    await fetchLinks(client, 'https://ado.example.com/', 'MyProject', ['X']);

    // Should not double-slash the URL
    const calledUrl: string = (client.post as jest.Mock).mock.calls[0][0];
    expect(calledUrl).not.toContain('//MyProject');
  });

  it('WIQL body uses IN clause for multiple relation types', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: [] });

    await fetchLinks(client, 'https://ado.example.com', 'Proj', ['System.LinkTypes.Hierarchy-Forward', 'System.LinkTypes.Related']);

    const calledBody: { query: string } = (client.post as jest.Mock).mock.calls[0][1];
    expect(calledBody.query).toContain("IN ('System.LinkTypes.Hierarchy-Forward','System.LinkTypes.Related')");
  });

  it('api-version fallback: retries on 400, succeeds on second attempt', async () => {
    const client = makeClient();
    const err400 = Object.assign(new Error('Not supported'), { response: { status: 400 } });

    (client.post as jest.Mock)
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({ workItemRelations: [] });

    const result = await fetchLinks(client, 'https://ado.example.com', 'Proj', ['X']);

    expect(client.post).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('api-version fallback: propagates 401 immediately without retrying', async () => {
    const client = makeClient();
    const err401 = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });

    (client.post as jest.Mock).mockRejectedValue(err401);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', ['X'])
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('api-version fallback: propagates 403 immediately without retrying', async () => {
    const client = makeClient();
    const err403 = Object.assign(new Error('Forbidden'), { response: { status: 403 } });

    (client.post as jest.Mock).mockRejectedValue(err403);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', ['X'])
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('api-version fallback: throws after exhausting all versions', async () => {
    const client = makeClient();
    const err400 = Object.assign(new Error('Not supported'), { response: { status: 400 } });

    (client.post as jest.Mock).mockRejectedValue(err400);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', ['X'])
    ).rejects.toMatchObject({ response: { status: 400 } });

    // 3 versions: '7.1', '5.1', ''
    expect(client.post).toHaveBeenCalledTimes(3);
  });

  it('filters out relations with non-integer source id', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      workItemRelations: [
        { rel: 'X', source: { id: 1.5 }, target: { id: 2 } },  // non-integer → filtered
        { rel: 'X', source: { id: 1 }, target: { id: 2 } },    // valid
      ],
    });

    const result = await fetchLinks(client, 'https://ado.example.com', 'Proj', ['X']);

    expect(result).toHaveLength(1);
    expect(result[0].source?.id).toBe(1);
  });
});

// ─── fetchWorkItems ────────────────────────────────────────────────────────────

describe('fetchWorkItems', () => {
  it('returns empty array when ids is empty', async () => {
    const client = makeClient();
    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [], ['System.Id']);
    expect(result).toEqual([]);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('maps ADO fields to WorkItem correctly', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      value: [
        {
          id: 42,
          url: 'https://ado.example.com/wi/42',
          fields: {
            'System.WorkItemType': 'Task',
            'System.Title': 'Do something',
            'System.State': 'Active',
            'System.TeamProject': 'MyProject',
            'Microsoft.VSTS.Scheduling.OriginalEstimate': 8,
          },
        },
      ],
    });

    const result = await fetchWorkItems(
      client,
      'https://ado.example.com',
      'MyProject',
      [42],
      ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject', 'Microsoft.VSTS.Scheduling.OriginalEstimate'],
      'Microsoft.VSTS.Scheduling.OriginalEstimate'
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 42,
      type: 'Task',
      title: 'Do something',
      state: 'Active',
      teamProject: 'MyProject',
      effort: 8,
      url: 'https://ado.example.com/wi/42',
    });
  });

  it('effort is null when no extra numeric field present', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      value: [
        {
          id: 10,
          fields: {
            'System.WorkItemType': 'Epic',
            'System.Title': 'Big epic',
            'System.State': 'New',
            'System.TeamProject': 'Proj',
          },
        },
      ],
    });

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [10], ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject']);

    expect(result[0].effort).toBeNull();
  });

  it('excludes the resolved effort field from extraFields even when it is also a requested custom column', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      value: [
        {
          id: 1,
          fields: {
            'System.WorkItemType': 'Task', 'System.Title': 'T', 'System.State': 'Active', 'System.TeamProject': 'P',
            'Custom.RiskLevel': 5,
          },
        },
      ],
    });

    const result = await fetchWorkItems(
      client, 'https://ado.example.com', 'P', [1],
      ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject', 'Custom.RiskLevel'],
      'Custom.RiskLevel'
    );

    expect(result[0].effort).toBe(5);
    expect(result[0].extraFields).toBeUndefined();
  });

  it('resolves effort to null (does not guess) when multiple non-known fields are requested and effortField is omitted', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      value: [
        {
          id: 1,
          fields: {
            'System.WorkItemType': 'Task', 'System.Title': 'T', 'System.State': 'Active', 'System.TeamProject': 'P',
            'Custom.A': 1, 'Custom.B': 2,
          },
        },
      ],
    });

    const result = await fetchWorkItems(
      client, 'https://ado.example.com', 'P', [1],
      ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject', 'Custom.A', 'Custom.B']
    );

    expect(result[0].effort).toBeNull();
    expect(result[0].extraFields).toEqual({ 'Custom.A': 1, 'Custom.B': 2 });
  });

  it('returns cached value without calling AdoClient.post', async () => {
    const client = makeClient();
    const cached = [{ id: 1, type: 'Task', title: 'T', state: 'Active', teamProject: 'P', effort: null }];
    mockedCacheGet.mockReturnValue(cached);

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id']);

    expect(result).toBe(cached);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('bypassCache=true skips the cache and hits AdoClient.post even when a cached value exists', async () => {
    const client = makeClient();
    const cached = [{ id: 1, type: 'Task', title: 'Stale (pre-delete)', state: 'Active', teamProject: 'P', effort: null }];
    mockedCacheGet.mockReturnValue(cached);
    (client.post as jest.Mock).mockResolvedValueOnce({ value: [] }); // item 1 deleted — omitted from batch response

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id'], undefined, true);

    expect(result).toEqual([]);
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('coalesces two concurrent bypassCache calls with identical params into one AdoClient.post call', async () => {
    const client = makeClient();
    mockedCacheGet.mockReturnValue(undefined);
    (client.post as jest.Mock).mockResolvedValueOnce({
      value: [{ id: 1, fields: { 'System.Id': 1, 'System.Title': 'Fresh' } }],
    });

    const [a, b] = await Promise.all([
      fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id'], undefined, true),
      fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id'], undefined, true),
    ]);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ id: 1, title: 'Fresh' });
  });

  it('chunks ids correctly — sends 2 requests for 201 ids with batch size 200', async () => {
    const client = makeClient();
    // Default batch size is 200
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);

    (client.post as jest.Mock).mockResolvedValue({ value: [] });

    await fetchWorkItems(client, 'https://ado.example.com', 'Proj', ids, ['System.Id']);

    // Should have made exactly 2 batch calls
    expect(client.post).toHaveBeenCalledTimes(2);

    const firstCallBody = (client.post as jest.Mock).mock.calls[0][1] as { ids: number[] };
    const secondCallBody = (client.post as jest.Mock).mock.calls[1][1] as { ids: number[] };
    expect(firstCallBody.ids).toHaveLength(200);
    expect(secondCallBody.ids).toHaveLength(1);
  });

  it('stores result in cache after a successful fetch', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ value: [] });

    await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1, 2], ['System.Id']);

    expect(mockedCacheSet).toHaveBeenCalledTimes(1);
  });

  it('handles missing value key in response gracefully', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id']);

    expect(result).toEqual([]);
  });

  it('api-version fallback: retries on 400, succeeds on second attempt', async () => {
    const client = makeClient();
    const err400 = Object.assign(new Error('Not supported'), { response: { status: 400 } });

    (client.post as jest.Mock)
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({ value: [] });

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id']);

    expect(client.post).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('api-version fallback: propagates 401 without retrying', async () => {
    const client = makeClient();
    const err401 = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    (client.post as jest.Mock).mockRejectedValue(err401);

    await expect(
      fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id'])
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(client.post).toHaveBeenCalledTimes(1);
  });
});

// ─── fetchQueryRootIds ─────────────────────────────────────────────────────────

describe('fetchQueryRootIds', () => {
  it('returns ids from a flat query with no queryRelations', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [{ id: 10 }, { id: 20 }],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-1');

    expect(result.rootIds).toEqual([10, 20]);
    expect(result.queryRelations).toEqual([]);
  });

  it('flat query: matchedIds equals rootIds directly (no query-definition fetch)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [{ id: 10 }, { id: 20 }],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-flat-matched');

    expect(result.matchedIds).toEqual([10, 20]);
    expect(client.get).toHaveBeenCalledTimes(1); // no query-definition round trip for flat
  });

  it('tree query: fetches query definition and bundles derived matchedIds', async () => {
    const client = makeClient();
    (client.get as jest.Mock)
      .mockResolvedValueOnce({
        queryType: 'tree',
        workItemRelations: [
          { source: { id: 1 }, target: { id: 2 } },
          { source: { id: 1 }, target: { id: 3 } },
        ],
      })
      .mockResolvedValueOnce({
        queryType: 'tree',
        sourceClauses: {
          clauses: [], field: { name: 'Work Item Type', referenceName: 'System.WorkItemType' },
          fieldValue: null, isFieldValue: false, logicalOperator: 'AND',
          operator: { name: 'Equals', referenceName: 'SupportedOperations.Equals' }, value: 'Epic',
        },
      });
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 1 }] });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-tree-matched');

    expect(result.matchedIds).toEqual([1]);
    const [defUrl] = (client.get as jest.Mock).mock.calls[1];
    expect(defUrl).toContain('/Proj/_apis/wit/queries/query-id-tree-matched');
    expect(defUrl).toContain('$expand=all');
  });

  it('tree query: matchedIds is null when the query definition fetch fails', async () => {
    const client = makeClient();
    (client.get as jest.Mock)
      .mockResolvedValueOnce({
        queryType: 'tree',
        workItemRelations: [{ source: { id: 1 }, target: { id: 2 } }],
      })
      .mockRejectedValue(new Error('definition fetch failed'));

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-def-fail');

    expect(result.matchedIds).toBeNull();
  });

  it('returns top-level source ids from a tree query (sources not appearing as targets)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'tree',
      workItemRelations: [
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 2 }, target: { id: 3 } },
      ],
    });

    // id 2 is a target → not a root; id 1 is only a source → root
    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-2');

    expect(result.rootIds).toEqual([1]);
  });

  it('tags tree-query relations with origin: query', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'tree',
      workItemRelations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 } },
      ],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-tag');

    expect(result.queryRelations).toEqual([
      { rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 }, origin: 'query' },
    ]);
  });

  it('deduplicates root ids in tree query', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'tree',
      workItemRelations: [
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 1 }, target: { id: 3 } },
      ],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-3');

    expect(result.rootIds).toEqual([1]);
  });

  it('returns empty array for a truly unknown queryType', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({ queryType: 'somethingElse' });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'query-id-4');

    expect(result.rootIds).toEqual([]);
  });

  it('extracts root ids from a oneHop ("Direct Links") query via null-source markers', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'oneHop',
      workItemRelations: [
        { source: null, target: { id: 1 } },
        { rel: 'System.LinkTypes.Related', source: { id: 1 }, target: { id: 2 } },
        { source: null, target: { id: 3 } },
      ],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'onehop-query');

    expect(result.rootIds).toEqual([1, 3]);
    expect(result.queryRelations).toEqual([
      { rel: 'System.LinkTypes.Related', source: { id: 1 }, target: { id: 2 }, origin: 'query' },
    ]);
  });

  it('matches queryType case-insensitively (on-prem TFS casing)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValueOnce({
      queryType: 'Flat',
      workItems: [{ id: 7 }],
    });

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'flat-cased');

    expect(result.rootIds).toEqual([7]);
  });

  it('returns cached value without calling AdoClient.get', async () => {
    const client = makeClient();
    const cached = { rootIds: [5, 6], queryRelations: [] };
    mockedCacheGet.mockReturnValue(cached);

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'cached-query');

    expect(result).toBe(cached);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('bypassCache=true skips the cache and hits AdoClient.get even when a cached value exists', async () => {
    const client = makeClient();
    const cached = { rootIds: [5, 6], queryRelations: [], matchedIds: null };
    mockedCacheGet.mockReturnValue(cached);
    (client.get as jest.Mock).mockResolvedValueOnce({ queryType: 'Flat', workItems: [{ id: 5 }] }); // 6 was deleted

    const result = await fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'cached-query', true);

    expect(result.rootIds).toEqual([5]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('coalesces two concurrent bypassCache calls with identical params into one AdoClient.get call', async () => {
    const client = makeClient();
    mockedCacheGet.mockReturnValue(undefined);
    (client.get as jest.Mock).mockResolvedValueOnce({ queryType: 'Flat', workItems: [{ id: 5 }] });

    const [a, b] = await Promise.all([
      fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'q-1', true),
      fetchQueryRootIds(client, 'https://ado.example.com', 'Proj', 'q-1', true),
    ]);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(a.rootIds).toEqual([5]);
    expect(b.rootIds).toEqual([5]);
  });
});

// ─── classifyMissingIds ──────────────────────────────────────────────────────

// Extracts the trailing work item id from the probe URL so a single mockImplementation
// can answer differently per id — needed because withApiVersionFallback retries 400/404/405
// across API_VERSIONS (3 calls per id), so a plain mockRejectedValueOnce would only cover
// the first attempt and the retry would spuriously "succeed" against jest's default mock.
function idFromProbeUrl(url: string): number {
  return Number(url.split('/').pop()?.split('?')[0]);
}

describe('classifyMissingIds', () => {
  it('returns an empty map for an empty id list without calling AdoClient', async () => {
    const client = makeClient();
    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', []);
    expect(result.size).toBe(0);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('classifies a 403 response as restricted (single attempt, no version retry)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockRejectedValue({ response: { status: 403 } });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [1]);

    expect(result.get(1)).toBe('restricted');
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('classifies a 401 response as restricted (single attempt, no version retry)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockRejectedValue({ response: { status: 401 } });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [1]);

    expect(result.get(1)).toBe('restricted');
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('classifies a 404 response as deleted (persists across api-version fallback retries)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [2]);

    expect(result.get(2)).toBe('deleted');
  });

  it('classifies an unexpected error status as missing', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockRejectedValue({ response: { status: 500 } });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [3]);

    expect(result.get(3)).toBe('missing');
  });

  it('classifies an id that resolves in isolation as missing (transient batch omission)', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockResolvedValue({ id: 4 });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [4]);

    expect(result.get(4)).toBe('missing');
  });

  it('classifies multiple ids independently by url', async () => {
    const client = makeClient();
    (client.get as jest.Mock).mockImplementation((url: string) => {
      const id = idFromProbeUrl(url);
      if (id === 1) return Promise.reject({ response: { status: 403 } });
      if (id === 2) return Promise.reject({ response: { status: 404 } });
      return Promise.resolve({ id });
    });

    const result = await classifyMissingIds(client, 'https://ado.example.com', 'Proj', [1, 2]);

    expect(result.get(1)).toBe('restricted');
    expect(result.get(2)).toBe('deleted');
  });
});
