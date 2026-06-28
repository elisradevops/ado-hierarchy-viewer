/**
 * ADO Extension SDK loader and context initializer.
 * Uses azure-devops-extension-sdk as an ES import (Vite-bundled) so that
 * getClient() from azure-devops-extension-api shares the same initialized instance.
 */

import * as SDK from 'azure-devops-extension-sdk';

export interface AdoContext {
  isAdo: boolean;
  sdk: typeof SDK | null;
  project: string;
  collectionUri: string;
  accessToken: string;
}

// Module-level promise singleton — ensure SDK is only initialized once.
let initPromise: Promise<AdoContext> | null = null;

const hasAnySearchParam = (params: URLSearchParams, names: string[]): boolean =>
  names.some(name => params.has(name));

const isAzureDevOpsHost = (value: string): boolean => {
  try {
    const url = new URL(String(value || ''));
    const host = (url.hostname || '').toLowerCase();
    return host === 'dev.azure.com' || host.endsWith('.visualstudio.com');
  } catch {
    return false;
  }
};

const hasAdoHostSignals = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const params = new URLSearchParams(window.location.search || '');
  if (
    hasAnySearchParam(params, [
      'hostorigin',
      'hostOrigin',
      'extensionId',
      'instanceId',
      'ms.vss-web.extension-data',
    ])
  ) {
    return true;
  }

  const href = String(window.location.href || '').toLowerCase();
  if (href.includes('/_apps/hub/') || href.includes('/_apis/public/gallery/')) {
    return true;
  }

  // Azure DevOps extensions run in an iframe; referrer is typically the host page.
  if (window.self !== window.top && isAzureDevOpsHost(document.referrer || '')) {
    return true;
  }

  return false;
};

/**
 * Attempts to extract a collection URI from the current window location,
 * falling back to the document referrer.
 */
function deriveCollectionUriFromWindow(projectName: string | undefined): string {
  try {
    if (typeof window !== 'undefined') {
      const rawBase = window.location.href.split('/_apps/')[0] ?? '';
      if (rawBase && !rawBase.includes('/_apis/public/gallery/')) {
        const parts = rawBase.split('/');
        if (
          projectName &&
          parts[parts.length - 1]?.toLowerCase() === projectName.toLowerCase()
        ) {
          parts.pop();
        }
        return `${parts.join('/')}/`;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof document !== 'undefined' && document.referrer) {
      const ref = new URL(document.referrer);
      let refBase = ref.origin + ref.pathname;
      if (refBase.includes('/_apps/')) {
        refBase = refBase.split('/_apps/')[0];
      }
      if (
        projectName &&
        refBase.toLowerCase().endsWith(`/${projectName.toLowerCase()}`)
      ) {
        refBase = refBase.slice(0, -(projectName.length + 1));
      }
      if (refBase && !refBase.includes('/_apis/public/gallery/')) {
        return refBase.endsWith('/') ? refBase : `${refBase}/`;
      }
    }
  } catch {
    /* ignore */
  }

  return '';
}

export async function initAdoContext(): Promise<AdoContext> {
  if (initPromise) return initPromise;

  // `_retryable` is set inside the async body when a timeout occurs on an ADO host.
  // It is read from the `.then()` chain OUTSIDE the body so that `initPromise` is
  // mutated only after the promise settles — avoiding concurrent-caller races where
  // a second caller sees `initPromise === null` and starts a parallel SDK.init().
  let _retryable = false;

  const _inner = (async (): Promise<AdoContext> => {
    const fallback: AdoContext = {
      isAdo: false,
      sdk: null,
      project: '',
      collectionUri: '',
      accessToken: '',
    };

    if (!hasAdoHostSignals()) {
      // Definitively not an ADO host — cache the fallback permanently (correct).
      return fallback;
    }

    // Initialize SDK
    let initialized = true;
    try {
      const initResult: unknown = SDK.init({ loaded: false, applyTheme: true });
      if (initResult && typeof (initResult as Promise<unknown>).then === 'function') {
        initialized = await Promise.race([
          (initResult as Promise<unknown>).then(() => true).catch(() => false),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1500)),
        ]);
      }
    } catch {
      initialized = false;
    }
    if (!initialized) {
      _retryable = true; // signal outer chain to clear initPromise for retry
      return fallback;
    }

    // Wait for SDK ready
    let ready = true;
    try {
      ready = await Promise.race([
        SDK.ready().then(() => true).catch(() => false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1500)),
      ]);
    } catch {
      ready = false;
    }
    if (!ready) {
      _retryable = true; // signal outer chain to clear initPromise for retry
      return fallback;
    }

    // Extract host/web context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hostInfo: any = typeof SDK.getHost === 'function' ? SDK.getHost() : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webContext: any =
      (typeof SDK.getWebContext === 'function' && SDK.getWebContext()) ||
      hostInfo?.webContext ||
      null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let project: any = webContext?.project ?? null;
    try {
      if ((!project || !project.id) && typeof SDK.getPageContext === 'function') {
        const pageContext = SDK.getPageContext();
        const pageProject = pageContext?.webContext?.project;
        if (pageProject?.id) {
          project = { ...project, ...pageProject };
        }
      }
    } catch {
      /* ignore */
    }

    let collectionUri: string =
      webContext?.collection?.uri ||
      webContext?.collection?.url ||
      hostInfo?.host?.uri ||
      hostInfo?.host?.url ||
      webContext?.account?.uri ||
      webContext?.host?.uri ||
      '';

    if (!collectionUri) {
      collectionUri = deriveCollectionUriFromWindow(project?.name as string | undefined);
    }

    if (collectionUri && !collectionUri.endsWith('/')) {
      collectionUri = `${collectionUri}/`;
    }

    let accessToken = '';
    try {
      accessToken = (await SDK.getAccessToken()) as string;
    } catch {
      /* ignore token errors */
    }

    return {
      isAdo: true,
      sdk: SDK,
      project: (project?.name as string) ?? '',
      collectionUri,
      accessToken,
    };
  })();

  // Chain outside the async body: clear initPromise only after it settles,
  // so concurrent callers always get the same pending promise (no race).
  initPromise = _inner.then(result => {
    if (_retryable) initPromise = null; // timed-out ADO host — allow retry on remount
    return result;
  }).catch(err => {
    initPromise = null; // unexpected throw — always allow retry
    throw err;
  });

  return initPromise;
}
