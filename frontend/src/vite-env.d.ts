/// <reference types="vite/client" />

// Runtime config injected by env-uri-init.sh via /config.js
interface AppConfig {
  BFF_URL?: string;
}
declare interface Window {
  APP_CONFIG?: AppConfig;
}
