import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdoContext } from '../../hooks/useAdoContext';
import { useConnectionStore } from '../../state/connectionStore';
import { useConfigStore } from '../../state/configStore';

vi.mock('../../adoSdk', () => ({
  initAdoContext: vi.fn(),
  requestLoadFailed: vi.fn(),
}));

import { initAdoContext, requestLoadFailed } from '../../adoSdk';

const VALID_JWT = 'aaa.bbb.ccc';

describe('useAdoContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      mode: 'standalone',
      orgUrl: '',
      credential: '',
      status: 'idle',
      error: null,
    });
    useConfigStore.getState().resetConfig();
  });

  it('extension mode: connects, seeds team project, and resolves ready with no error', async () => {
    vi.mocked(initAdoContext).mockResolvedValue({
      isAdo: true,
      sdk: { fake: 'sdk' } as never,
      project: 'MyProject',
      collectionUri: 'https://dev.azure.com/myorg/',
      accessToken: VALID_JWT,
    });

    const { result } = renderHook(() => useAdoContext());

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.mode).toBe('extension');
    expect(result.current.error).toBeNull();
    expect(result.current.sdk).toEqual({ fake: 'sdk' });
    expect(useConnectionStore.getState().credential).toBe(`bearer:${VALID_JWT}`);
    expect(useConfigStore.getState().config.teamProject).toBe('MyProject');
    expect(requestLoadFailed).not.toHaveBeenCalled();
  });

  it('extension mode: surfaces an error and notifies the host when no project is resolved', async () => {
    vi.mocked(initAdoContext).mockResolvedValue({
      isAdo: true,
      sdk: null,
      project: '',
      collectionUri: 'https://dev.azure.com/myorg/',
      accessToken: VALID_JWT,
    });

    const { result } = renderHook(() => useAdoContext());

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.error).toMatch(/could not determine the ado project/i);
    expect(requestLoadFailed).toHaveBeenCalledTimes(1);
    // Still connects the extension transport even though the project is unknown —
    // only the config seed is skipped.
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('extension mode: surfaces an error and notifies the host when token acquisition fails', async () => {
    vi.mocked(initAdoContext).mockResolvedValue({
      isAdo: true,
      sdk: null,
      project: 'MyProject',
      collectionUri: 'https://dev.azure.com/myorg/',
      accessToken: '',
    });

    const { result } = renderHook(() => useAdoContext());

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.error).toMatch(/could not acquire ado token/i);
    expect(requestLoadFailed).toHaveBeenCalledTimes(1);
    // Never reached connectExtension — no accessToken to build a bearer header from.
    expect(useConnectionStore.getState().status).toBe('idle');
  });

  it('standalone mode: resolves ready with no error and does not touch connection/config stores', async () => {
    vi.mocked(initAdoContext).mockResolvedValue({
      isAdo: false,
      sdk: null,
      project: '',
      collectionUri: '',
      accessToken: '',
    });

    const { result } = renderHook(() => useAdoContext());

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.mode).toBe('standalone');
    expect(result.current.error).toBeNull();
    expect(useConnectionStore.getState().status).toBe('idle');
    expect(useConfigStore.getState().config.teamProject).toBe('');
    expect(requestLoadFailed).not.toHaveBeenCalled();
  });

  it('SDK init rejection: still resolves ready, surfaces the error, and notifies the host', async () => {
    vi.mocked(initAdoContext).mockRejectedValue(new Error('SDK handshake timed out'));

    const { result } = renderHook(() => useAdoContext());

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.error).toBe('SDK handshake timed out');
    expect(requestLoadFailed).toHaveBeenCalledTimes(1);
  });

  it('only initializes the SDK once across re-renders', async () => {
    vi.mocked(initAdoContext).mockResolvedValue({
      isAdo: false,
      sdk: null,
      project: '',
      collectionUri: '',
      accessToken: '',
    });

    const { result, rerender } = renderHook(() => useAdoContext());
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender();
    rerender();

    expect(initAdoContext).toHaveBeenCalledTimes(1);
  });
});
