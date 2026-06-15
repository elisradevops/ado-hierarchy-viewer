/// <reference types="vite/client" />

// Runtime config injected by env-uri-init.sh via /config.js
interface AppConfig {
  BFF_URL?: string;
}
declare interface Window {
  APP_CONFIG?: AppConfig;
}

// RequireJS AMD global (loaded via /lib/require.js in index.html)
declare function require(
  deps: string[],
  callback: (...args: unknown[]) => void,
  errback?: (err: unknown) => void
): void;
declare namespace require {
  function config(cfg: Record<string, unknown>): void;
}
