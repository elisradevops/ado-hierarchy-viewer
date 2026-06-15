import { create } from 'zustand';
import type { ConnectionMode, ConnectionStatus } from '../types';

interface ConnectionStore {
  mode: ConnectionMode;
  orgUrl: string;
  credential: string;
  status: ConnectionStatus;
  error: string | null;

  connectStandalone: (orgUrl: string, pat: string) => void;
  connectExtension: (collectionUri: string, bearerToken: string) => void;
  disconnect: () => void;
  setStatus: (status: ConnectionStatus, error?: string) => void;
}

export const useConnectionStore = create<ConnectionStore>(set => ({
  mode: 'standalone',
  orgUrl: '',
  credential: '',
  status: 'idle',
  error: null,

  connectStandalone: (orgUrl, pat) =>
    set({
      mode: 'standalone',
      orgUrl: orgUrl.trim().replace(/\/$/, ''),
      credential: pat,
      status: 'connected',
      error: null,
    }),

  connectExtension: (collectionUri, bearerToken) =>
    set({
      mode: 'extension',
      orgUrl: collectionUri.trim().replace(/\/$/, ''),
      credential: bearerToken,
      status: 'connected',
      error: null,
    }),

  disconnect: () => set({ status: 'idle', credential: '', error: null }),

  setStatus: (status, error = undefined) =>
    set({ status, error: error ?? null }),
}));
