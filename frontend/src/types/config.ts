export interface HierarchyConfig {
  tfsUrl: string;
  teamProject: string;
  relationTypes: string[];
  closedState: string;
  effortField: string;
  queryId?: string;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type ConnectionMode = 'standalone' | 'extension';

export interface ConnectionState {
  mode: ConnectionMode;
  orgUrl: string;
  credential: string;
  status: ConnectionStatus;
  error: string | null;
}

export interface AuthCtx {
  orgUrl: string;
  credential: string;
}
