import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthRecovery } from '../../hooks/useAuthRecovery';
import { useConnectionStore } from '../../state/connectionStore';
import { storage } from '../../utils/storage';

vi.mock('../../adoSdk', () => ({
  getFreshAccessToken: vi.fn(),
}));

import { getFreshAccessToken } from '../../adoSdk';

const VALID_JWT = 'aaa.bbb.ccc';

function dispatchUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('auth-unauthorized'));
}

describe('useAuthRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      mode: 'standalone',
      orgUrl: '',
      credential: '',
      status: 'idle',
      error: null,
    });
  });

  afterEach(() => {
    storage.session.remove('orgUrl');
    storage.session.remove('pat');
  });

  it('extension mode: refreshes token and retries load on successful refresh', async () => {
    useConnectionStore.getState().connectExtension('https://dev.azure.com/org/', 'bearer:old.old.old');
    vi.mocked(getFreshAccessToken).mockResolvedValue(VALID_JWT);
    const retryLoad = vi.fn();

    renderHook(() => useAuthRecovery(retryLoad));
    dispatchUnauthorized();

    await waitFor(() => expect(retryLoad).toHaveBeenCalledTimes(1));
    expect(useConnectionStore.getState().credential).toBe(`bearer:${VALID_JWT}`);
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('extension mode: sets status error when refresh fails (empty token)', async () => {
    useConnectionStore.getState().connectExtension('https://dev.azure.com/org/', 'bearer:old.old.old');
    vi.mocked(getFreshAccessToken).mockResolvedValue('');
    const retryLoad = vi.fn();

    renderHook(() => useAuthRecovery(retryLoad));
    dispatchUnauthorized();

    await waitFor(() => expect(useConnectionStore.getState().status).toBe('error'));
    expect(retryLoad).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().error).toMatch(/session expired/i);
  });

  it('standalone mode: clears stored credentials and disconnects', async () => {
    useConnectionStore.getState().connectStandalone('https://dev.azure.com/org', 'my-pat');
    storage.session.set('orgUrl', 'https://dev.azure.com/org');
    storage.session.set('pat', 'my-pat');
    const retryLoad = vi.fn();

    renderHook(() => useAuthRecovery(retryLoad));
    dispatchUnauthorized();

    await waitFor(() => expect(useConnectionStore.getState().status).toBe('idle'));
    expect(useConnectionStore.getState().credential).toBe('');
    expect(storage.session.get('orgUrl')).toBeNull();
    expect(storage.session.get('pat')).toBeNull();
    expect(getFreshAccessToken).not.toHaveBeenCalled();
  });
});
