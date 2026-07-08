import { useEffect, useRef } from 'react';
import { getFreshAccessToken } from '../adoSdk';
import { useConnectionStore } from '../state/connectionStore';
import { storage } from '../utils/storage';
import { normalizeToBearerHeader } from '../utils/tokenUtils';

/**
 * Listens for the `auth-unauthorized` event dispatched by httpClient.ts (BFF 401)
 * and adoDirect.ts (direct ADO 401) and recovers per connection mode:
 *  - extension: ADO SDK access tokens are short-lived (~1hr) and are otherwise
 *    cached forever (see adoSdk.ts initAdoContext). Silently re-fetch a fresh
 *    token and retry the load; only fall back to an explicit reconnect prompt
 *    (ConnectionGate) if the refresh itself fails.
 *  - standalone: the stored PAT is no longer valid — clear it and disconnect
 *    so ConnectionGate falls back to LoginForm.
 *
 * Without this listener the event was previously dispatched to no consumer,
 * so an expired session failed every subsequent request silently forever.
 */
export function useAuthRecovery(retryLoad: () => void): void {
  const recoveringRef = useRef(false);
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const connectExtension = useConnectionStore(s => s.connectExtension);
  const disconnect = useConnectionStore(s => s.disconnect);
  const setStatus = useConnectionStore(s => s.setStatus);

  useEffect(() => {
    const handleUnauthorized = (): void => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;

      void (async () => {
        try {
          const mode = useConnectionStore.getState().mode;
          if (mode === 'extension') {
            const token = await getFreshAccessToken();
            if (token) {
              connectExtension(orgUrl, normalizeToBearerHeader(token));
              retryLoad();
            } else {
              setStatus('error', 'Azure DevOps session expired — reload the page to reconnect.');
            }
          } else {
            storage.session.remove('orgUrl');
            storage.session.remove('pat');
            disconnect();
          }
        } finally {
          recoveringRef.current = false;
        }
      })();
    };

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [orgUrl, connectExtension, disconnect, setStatus, retryLoad]);
}
