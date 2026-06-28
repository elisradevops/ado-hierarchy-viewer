import request from 'supertest';
import { createApp } from '../app';

// Per-test controllable mock for AdoClient.get
const mockGet = jest.fn();

jest.mock('../services/AdoClient', () => ({
  AdoClient: jest.fn().mockImplementation(() => ({ get: mockGet })),
}));

// Isolate cache so tests don't bleed into each other
jest.mock('../services/cache', () => {
  const store = new Map<string, unknown>();
  return {
    cacheGet: jest.fn((key: string) => store.get(key)),
    cacheSet: jest.fn((key: string, value: unknown) => { store.set(key, value); }),
    cacheDelete: jest.fn((key: string) => { store.delete(key); }),
    __store: store,
  };
});

import { cacheGet, cacheSet } from '../services/cache';

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

const ADO_HEADERS = {
  'x-ado-org-url': 'https://ado.example.com',
  'x-ado-pat': 'test-pat-token',
};

describe('MetadataController', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    delete process.env['BFF_API_KEY'];
    app = createApp();
    mockGet.mockReset();
    mockCacheGet.mockReturnValue(undefined);
    mockCacheSet.mockClear();
  });

  // ── GET /api/validate-connection ────────────────────────────────────────────

  describe('GET /api/validate-connection', () => {
    it('returns 400 when credentials are missing', async () => {
      const res = await request(app).get('/api/validate-connection');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 200 with user display name from connectionData', async () => {
      mockGet.mockResolvedValueOnce({
        authenticatedUser: { providerDisplayName: 'Eden Schwartz', subjectDescriptor: 'desc' },
      });
      const res = await request(app).get('/api/validate-connection').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ valid: true, user: 'Eden Schwartz' });
    });

    it('falls back to subjectDescriptor when providerDisplayName is absent', async () => {
      mockGet.mockResolvedValueOnce({
        authenticatedUser: { subjectDescriptor: 'desc-123' },
      });
      const res = await request(app).get('/api/validate-connection').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ valid: true, user: 'desc-123' });
    });

    it('falls back to "authenticated" when authenticatedUser is empty', async () => {
      mockGet.mockResolvedValueOnce({ authenticatedUser: {} });
      const res = await request(app).get('/api/validate-connection').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.user).toBe('authenticated');
    });

    it('propagates ADO errors through errorHandler', async () => {
      mockGet.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));
      const res = await request(app).get('/api/validate-connection').set(ADO_HEADERS);
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── GET /api/relation-types ─────────────────────────────────────────────────

  describe('GET /api/relation-types', () => {
    it('returns cached value without calling ADO', async () => {
      const cached = { value: [{ referenceName: 'cached', name: 'Cached' }] };
      mockCacheGet.mockReturnValueOnce(cached);
      const res = await request(app).get('/api/relation-types').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(cached);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('filters out non-workItemLink relation types', async () => {
      mockGet.mockResolvedValueOnce({
        value: [
          { referenceName: 'System.LinkTypes.Hierarchy-Forward', name: 'Child', attributes: { usage: 'workItemLink' } },
          { referenceName: 'ArtifactLink', name: 'Artifact', attributes: { usage: 'resourceLink' } },
          { referenceName: 'Hyperlink', name: 'Hyperlink', attributes: {} },
        ],
      });
      const res = await request(app).get('/api/relation-types').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.value).toHaveLength(1);
      expect(res.body.value[0].referenceName).toBe('System.LinkTypes.Hierarchy-Forward');
    });

    it('handles empty value array from ADO', async () => {
      mockGet.mockResolvedValueOnce({ value: [] });
      const res = await request(app).get('/api/relation-types').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.value).toEqual([]);
    });

    it('propagates ADO errors through errorHandler', async () => {
      mockGet.mockRejectedValueOnce(new Error('ADO down'));
      const res = await request(app).get('/api/relation-types').set(ADO_HEADERS);
      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/work-item-type-meta ────────────────────────────────────────────

  describe('GET /api/work-item-type-meta', () => {
    it('returns 400 when credentials are missing', async () => {
      const res = await request(app).get('/api/work-item-type-meta?project=MyProj');
      expect(res.status).toBe(400);
    });

    it('returns 400 when project param is missing', async () => {
      const res = await request(app).get('/api/work-item-type-meta').set(ADO_HEADERS);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing project query param');
    });

    it('returns cached value without calling ADO', async () => {
      const cached = { types: [], stateColors: {}, fieldsByType: {} };
      mockCacheGet.mockReturnValueOnce(cached);
      const res = await request(app).get('/api/work-item-type-meta?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(cached);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns work item type meta with inline fields ($expand=fields path)', async () => {
      const types = [
        {
          name: 'Task',
          color: 'f2cb1d',
          icon: { id: 'icon-task', url: 'https://icon.url/task' },
          fields: [
            { referenceName: 'System.Id', name: 'ID' },
            { referenceName: 'System.Title', name: 'Title' },
          ],
        },
      ];
      // First call: workitemtypes?$expand=fields → returns inline fields
      // Second call: states for Task
      mockGet
        .mockResolvedValueOnce({ value: types })
        .mockResolvedValueOnce({ value: [{ name: 'Active', color: '339933', category: 'InProgress' }] });

      const res = await request(app).get('/api/work-item-type-meta?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.types).toHaveLength(1);
      expect(res.body.types[0]).toMatchObject({ name: 'Task', color: '#f2cb1d', iconUrl: 'https://icon.url/task' });
      expect(res.body.stateColors).toHaveProperty('active', '#339933');
      expect(res.body.fieldsByType['Task']).toContain('System.Id');
    });

    it('falls back to non-expanded workitemtypes when $expand=fields fails', async () => {
      const types = [{ name: 'Bug', color: 'cc293d', icon: { id: 'icon-bug', url: '' } }];
      mockGet
        .mockRejectedValueOnce(new Error('expand not supported'))  // $expand=fields fails
        .mockResolvedValueOnce({ value: types })                    // fallback workitemtypes
        .mockResolvedValueOnce({ value: [] })                       // states for Bug
        .mockResolvedValueOnce({ value: [{ referenceName: 'System.Id' }] }); // fields for Bug

      const res = await request(app).get('/api/work-item-type-meta?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.types[0].name).toBe('Bug');
      expect(res.body.fieldsByType['Bug']).toContain('System.Id');
    });

    it('returns degraded empty response when both workitemtypes calls fail', async () => {
      mockGet
        .mockRejectedValueOnce(new Error('expand failed'))
        .mockRejectedValueOnce(new Error('fallback failed'));

      const res = await request(app).get('/api/work-item-type-meta?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ types: [], stateColors: {}, fieldsByType: {} });
    });

    it('continues when state fetch fails for a type (partial degradation)', async () => {
      const types = [{ name: 'Task', color: 'f2cb1d', fields: [{ referenceName: 'System.Id', name: 'ID' }] }];
      mockGet
        .mockResolvedValueOnce({ value: types })       // types with inline fields
        .mockRejectedValueOnce(new Error('states 503')); // states fail for Task

      const res = await request(app).get('/api/work-item-type-meta?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.stateColors).toEqual({});
      expect(res.body.fieldsByType['Task']).toContain('System.Id');
    });
  });

  // ── GET /api/queries ────────────────────────────────────────────────────────

  describe('GET /api/queries', () => {
    it('returns 400 when credentials are missing', async () => {
      const res = await request(app).get('/api/queries?project=MyProj');
      expect(res.status).toBe(400);
    });

    it('returns 400 when project param is missing', async () => {
      const res = await request(app).get('/api/queries').set(ADO_HEADERS);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing project query param');
    });

    it('returns cached value without calling ADO', async () => {
      const cached = [{ id: 'q1', name: 'My Query', path: '/', isFolder: false, hasChildren: false }];
      mockCacheGet.mockReturnValueOnce(cached);
      const res = await request(app).get('/api/queries?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(cached);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns both My Queries and Shared Queries roots when both resolve', async () => {
      const myRoot = { id: 'my-root', name: 'My Queries', path: '/', isFolder: true, hasChildren: true, children: [] };
      const sharedRoot = { id: 'shared-root', name: 'Shared Queries', path: '/', isFolder: true, hasChildren: false };
      mockGet
        .mockResolvedValueOnce(myRoot)
        .mockResolvedValueOnce(sharedRoot);

      const res = await request(app).get('/api/queries?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('my-root');
      expect(res.body[1].id).toBe('shared-root');
    });

    it('returns only Shared Queries when My Queries fetch fails', async () => {
      const sharedRoot = { id: 'shared-root', name: 'Shared Queries', path: '/', isFolder: true, hasChildren: false };
      mockGet
        .mockRejectedValueOnce(new Error('My Queries not found'))
        .mockResolvedValueOnce(sharedRoot);

      const res = await request(app).get('/api/queries?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('shared-root');
    });

    it('returns empty array when both query roots fail', async () => {
      mockGet
        .mockRejectedValueOnce(new Error('My Queries 404'))
        .mockRejectedValueOnce(new Error('Shared Queries 404'));

      const res = await request(app).get('/api/queries?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('maps nested children recursively', async () => {
      const root = {
        id: 'root', name: 'My Queries', path: '/', isFolder: true, hasChildren: true,
        children: [
          { id: 'child-1', name: 'Sprint Queries', path: '/Sprint', isFolder: true, hasChildren: true,
            children: [
              { id: 'leaf-1', name: 'Active Items', path: '/Sprint/Active', isFolder: false, hasChildren: false, queryType: 'flat' },
            ],
          },
        ],
      };
      mockGet.mockResolvedValueOnce(root).mockRejectedValueOnce(new Error('no shared'));

      const res = await request(app).get('/api/queries?project=MyProj').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      const leaf = res.body[0].children[0].children[0];
      expect(leaf.id).toBe('leaf-1');
      expect(leaf.queryType).toBe('flat');
      expect(leaf.isFolder).toBe(false);
    });
  });

  // ── GET /api/projects ───────────────────────────────────────────────────────

  describe('GET /api/projects', () => {
    it('returns cached value without calling ADO', async () => {
      const cached = { value: [{ id: 'proj-1', name: 'MyProject' }] };
      mockCacheGet.mockReturnValueOnce(cached);
      const res = await request(app).get('/api/projects').set(ADO_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(cached);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('propagates ADO errors through errorHandler', async () => {
      mockGet.mockRejectedValueOnce(new Error('projects fetch failed'));
      const res = await request(app).get('/api/projects').set(ADO_HEADERS);
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });
});
