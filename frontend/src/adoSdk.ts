/**
 * ADO Extension SDK loader and context initializer.
 * Ported from docgen-frontend/src/adoSdk.js — TypeScript edition.
 */

export interface AdoContext {
  isAdo: boolean;
  sdk: unknown | null;
  project: string;
  collectionUri: string;
  accessToken: string;
}

// Module-level promise singletons — ensure SDK is only loaded/initialized once.
let sdkPromise: Promise<unknown | null> | null = null;
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

const getRequireJs = (): typeof require | null => {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.requirejs ?? w.require ?? null;
};

const configureRequireJs = (): typeof require | null => {
  const req = getRequireJs();
  if (!req) return null;
  try {
    const baseUrl = new URL('.', window.location.href).toString();
    req.config({
      baseUrl,
      paths: {
        VSS: 'lib',
        XDM: 'lib/XDM',
        tslib: 'lib/tslib',
      },
    });
  } catch {
    /* ignore config errors */
  }
  return req;
};

export const loadAdoSdk = async (): Promise<unknown | null> => {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<unknown | null>(resolve => {
    const req = configureRequireJs();
    if (!req) {
      resolve(null);
      return;
    }
    req(['VSS/SDK'], (SDK: unknown) => resolve(SDK ?? null), () => resolve(null));
  });
  return sdkPromise;
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

  initPromise = (async (): Promise<AdoContext> => {
    const fallback: AdoContext = {
      isAdo: false,
      sdk: null,
      project: '',
      collectionUri: '',
      accessToken: '',
    };

    if (!hasAdoHostSignals()) {
      return fallback;
    }

    const SDK = await loadAdoSdk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = SDK as any;
    if (!sdk || typeof sdk.init !== 'function') {
      return fallback;
    }

    // Initialize SDK
    let initialized = true;
    try {
      const initResult: unknown = sdk.init({ loaded: false, applyTheme: true });
      if (initResult && typeof (initResult as Promise<unknown>).then === 'function') {
        initialized = await Promise.race([
          (initResult as Promise<unknown>).then(() => true).catch(() => false),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1500)),
        ]);
      }
    } catch {
      initialized = false;
    }
    if (!initialized) return fallback;

    // Wait for SDK ready
    let ready = true;
    if (typeof sdk.ready === 'function') {
      ready = await Promise.race([
        (sdk.ready() as Promise<unknown>).then(() => true).catch(() => false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1500)),
      ]);
    }
    if (!ready) return fallback;

    // Extract host/web context
    const hostInfo = typeof sdk.getHost === 'function' ? sdk.getHost() : null;
    const webContext =
      (typeof sdk.getWebContext === 'function' && sdk.getWebContext()) ||
      hostInfo?.webContext ||
      null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let project: any = webContext?.project ?? null;
    try {
      if ((!project || !project.id) && typeof sdk.getPageContext === 'function') {
        const pageContext = sdk.getPageContext();
        if (pageContext?.project?.id) {
          project = { ...project, ...pageContext.project };
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

    // Ensure trailing slash
    if (collectionUri && !collectionUri.endsWith('/')) {
      collectionUri = `${collectionUri}/`;
    }

    let accessToken = '';
    try {
      if (typeof sdk.getAccessToken === 'function') {
        accessToken = (await sdk.getAccessToken()) as string;
      }
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

  return initPromise;
}
