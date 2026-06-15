import { fetchLinks, fetchWorkItems } from '../services/HierarchyService';
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

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', 'System.LinkTypes.Hierarchy-Forward', 'forward');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: 1 }, target: { id: 2 } });
    expect(result[1]).toEqual({ rel: 'X', source: { id: 5 }, target: { id: 6 } });
  });

  it('returns cached value without calling AdoClient.post', async () => {
    const client = makeClient();
    const cached = [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }];
    mockedCacheGet.mockReturnValue(cached);

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', 'X', 'forward');

    expect(result).toBe(cached);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('stores result in cache after a successful fetch', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({
      workItemRelations: [{ rel: 'X', source: { id: 1 }, target: { id: 2 } }],
    });

    await fetchLinks(client, 'https://ado.example.com', 'MyProject', 'X', 'forward');

    expect(mockedCacheSet).toHaveBeenCalledTimes(1);
  });

  it('handles empty workItemRelations gracefully', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: [] });

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', 'X', 'forward');

    expect(result).toEqual([]);
  });

  it('handles missing workItemRelations key gracefully', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchLinks(client, 'https://ado.example.com', 'MyProject', 'X', 'forward');

    expect(result).toEqual([]);
  });

  it('normalizes orgUrl trailing slash', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItemRelations: [] });

    await fetchLinks(client, 'https://ado.example.com/', 'MyProject', 'X', 'forward');

    // Should not double-slash the URL
    const calledUrl: string = (client.post as jest.Mock).mock.calls[0][0];
    expect(calledUrl).not.toContain('//MyProject');
  });

  it('api-version fallback: retries on 400, succeeds on second attempt', async () => {
    const client = makeClient();
    const err400 = Object.assign(new Error('Not supported'), { response: { status: 400 } });

    (client.post as jest.Mock)
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({ workItemRelations: [] });

    const result = await fetchLinks(client, 'https://ado.example.com', 'Proj', 'X', 'forward');

    expect(client.post).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('api-version fallback: propagates 401 immediately without retrying', async () => {
    const client = makeClient();
    const err401 = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });

    (client.post as jest.Mock).mockRejectedValue(err401);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', 'X', 'forward')
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('api-version fallback: propagates 403 immediately without retrying', async () => {
    const client = makeClient();
    const err403 = Object.assign(new Error('Forbidden'), { response: { status: 403 } });

    (client.post as jest.Mock).mockRejectedValue(err403);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', 'X', 'forward')
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('api-version fallback: throws after exhausting all versions', async () => {
    const client = makeClient();
    const err400 = Object.assign(new Error('Not supported'), { response: { status: 400 } });

    (client.post as jest.Mock).mockRejectedValue(err400);

    await expect(
      fetchLinks(client, 'https://ado.example.com', 'Proj', 'X', 'forward')
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

    const result = await fetchLinks(client, 'https://ado.example.com', 'Proj', 'X', 'forward');

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
      ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject', 'Microsoft.VSTS.Scheduling.OriginalEstimate']
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
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

  it('returns cached value without calling AdoClient.post', async () => {
    const client = makeClient();
    const cached = [{ id: 1, type: 'Task', title: 'T', state: 'Active', teamProject: 'P', effort: null }];
    mockedCacheGet.mockReturnValue(cached);

    const result = await fetchWorkItems(client, 'https://ado.example.com', 'Proj', [1], ['System.Id']);

    expect(result).toBe(cached);
    expect(client.post).not.toHaveBeenCalled();
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
