import { useEffect, useRef, useState } from 'react';
import { initAdoContext, requestLoadFailed, type AdoContext } from '../adoSdk';
import { useConnectionStore } from '../state/connectionStore';
import { useConfigStore } from '../state/configStore';
import { normalizeToBearerHeader } from '../utils/tokenUtils';

export interface UseAdoContextResult {
  mode: 'standalone' | 'extension';
  ready: boolean;
  error: string | null;
  sdk: unknown | null;
}

export function useAdoContext(): UseAdoContextResult {
  const initializedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<unknown | null>(null);
  const connectExtension = useConnectionStore(s => s.connectExtension);
  const setConfig = useConfigStore(s => s.setConfig);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    initAdoContext()
      .then((ctx: AdoContext) => {
        if (ctx.isAdo && ctx.accessToken) {
          const bearerToken = normalizeToBearerHeader(ctx.accessToken);
          connectExtension(ctx.collectionUri, bearerToken);
          if (ctx.project) {
            setConfig({ teamProject: ctx.project });
          } else {
            const msg = 'Could not determine the ADO project from context — try reloading the page.';
            setError(msg);
            // Unrecoverable for this load — tell the host so its spinner doesn't hang forever.
            requestLoadFailed(new Error(msg));
          }
        } else if (ctx.isAdo && !ctx.accessToken) {
          // ADO host detected but token acquisition failed — surface explicitly.
          // Without this, the UI appears connected but every request silently fails.
          const msg = 'Could not acquire ADO token — try reloading the page.';
          setError(msg);
          requestLoadFailed(new Error(msg));
        }
        setSdk(ctx.sdk ?? null);
        setReady(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'ADO SDK init failed');
        setReady(true); // still ready — standalone mode fallback
        // No-ops if the SDK handshake itself never completed (nothing to notify over).
        requestLoadFailed(err);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mode = useConnectionStore(s => s.mode);
  return { mode, ready, error, sdk };
}
