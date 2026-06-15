import type { Direction } from './tree';

export interface HierarchyConfig {
  tfsUrl: string;
  teamProject: string;
  relationType: string;
  direction: Direction;
  closedState: string;
  effortField: string;
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
