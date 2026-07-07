/**
 * Unit tests for adoSdk.ts — project resolution in extension mode.
 * Verifies the ProjectPageService fallback when getWebContext().project is null
 * (common in hub contributions with the modern azure-devops-extension-sdk).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── SDK stub ───────────────────────────────────────────────────────────────
const sdkStub = {
  init: vi.fn(),
  ready: vi.fn(),
  getWebContext: vi.fn(),
  getPageContext: vi.fn(),
  getHost: vi.fn(),
  getAccessToken: vi.fn(),
  getService: vi.fn(),
};

vi.mock('azure-devops-extension-sdk', () => sdkStub);

// ── window stub (ADO host signals) ─────────────────────────────────────────
// Make hasAdoHostSignals() return true by faking an ADO URL path
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    search: '',
    href: 'https://dev.azure.com/myorg/_apps/hub/elisradevops.ado-hierarchy-viewer.hierarchy-hub',
    pathname: '/_apps/hub/elisradevops.ado-hierarchy-viewer.hierarchy-hub',
    host: 'dev.azure.com',
    hostname: 'dev.azure.com',
    protocol: 'https:',
    origin: 'https://dev.azure.com',
  },
  writable: false,
});

// ── Dynamic import so the module-level `initPromise` is reset each test ────
// adoSdk.ts uses a module-level singleton; we reset it by re-importing per
// test via Vitest module isolation (resetModules in beforeEach).

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  // Default: SDK.init and ready resolve immediately
  sdkStub.init.mockResolvedValue(undefined);
  sdkStub.ready.mockResolvedValue(undefined);
  sdkStub.getAccessToken.mockResolvedValue('test-token');
  // Default: getHost returns null (no fallback needed)
  sdkStub.getHost.mockReturnValue(null);
});

// ── Helper to import fresh initAdoContext each test ────────────────────────
async function getInitAdoContext() {
  const mod = await import('../../adoSdk');
  return mod.initAdoContext;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('initAdoContext — project resolution', () => {
  it('returns project name from getWebContext when present', async () => {
    sdkStub.getWebContext.mockReturnValue({
      project: { id: 'proj-guid', name: 'MyProject' },
      collection: { uri: 'https://dev.azure.com/myorg/' },
    });
    sdkStub.getPageContext.mockReturnValue({ webContext: { project: { id: 'proj-guid', name: 'MyProject' } } });

    const initAdoContext = await getInitAdoContext();
    const ctx = await initAdoContext();

    expect(ctx.isAdo).toBe(true);
    expect(ctx.project).toBe('MyProject');
    // ProjectPageService should NOT be called when webContext already has a name
    expect(sdkStub.getService).not.toHaveBeenCalled();
  });

  it('falls back to ProjectPageService when getWebContext().project is null (regression repro)', async () => {
    // This is the bug: modern SDK hub contribution delivers project: null in webContext
    sdkStub.getWebContext.mockReturnValue({
      project: null,
      collection: { uri: 'https://dev.azure.com/myorg/' },
    });
    sdkStub.getPageContext.mockReturnValue({ webContext: { project: null } });

    // ProjectPageService returns the current project
    const projectPageService = { getProject: vi.fn().mockResolvedValue({ id: 'proj-guid', name: 'MyProject' }) };
    sdkStub.getService.mockResolvedValue(projectPageService);

    const initAdoContext = await getInitAdoContext();
    const ctx = await initAdoContext();

    expect(ctx.isAdo).toBe(true);
    expect(ctx.project).toBe('MyProject');
    expect(sdkStub.getService).toHaveBeenCalled();
    expect(projectPageService.getProject).toHaveBeenCalled();
  });

  it('returns empty project gracefully when ProjectPageService also returns undefined', async () => {
    sdkStub.getWebContext.mockReturnValue({ project: null, collection: { uri: 'https://dev.azure.com/myorg/' } });
    sdkStub.getPageContext.mockReturnValue({ webContext: { project: null } });
    sdkStub.getService.mockResolvedValue({ getProject: vi.fn().mockResolvedValue(undefined) });

    const initAdoContext = await getInitAdoContext();
    const ctx = await initAdoContext();

    expect(ctx.isAdo).toBe(true);
    expect(ctx.project).toBe('');
  });

  it('returns empty project gracefully when ProjectPageService times out', async () => {
    sdkStub.getWebContext.mockReturnValue({ project: null, collection: { uri: 'https://dev.azure.com/myorg/' } });
    sdkStub.getPageContext.mockReturnValue({ webContext: { project: null } });
    // getService never resolves → timeout race wins
    sdkStub.getService.mockReturnValue(new Promise(() => { /* never */ }));

    const initAdoContext = await getInitAdoContext();
    const ctx = await initAdoContext();

    expect(ctx.project).toBe('');
  });
});
