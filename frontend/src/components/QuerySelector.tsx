import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, InputAdornment, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import type { TreeViewBaseItem } from '@mui/x-tree-view/models';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import { fetchQueries } from '../api/hierarchyApi';
import { fetchQueriesDirect } from '../api/adoDirect';
import type { QueryTreeNode, ConnectionMode } from '../types';
import type { AuthCtx } from '../types';

interface QuerySelectorProps {
  open: boolean;
  orgUrl: string;
  teamProject: string;
  credential: string;
  mode: ConnectionMode;
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}

type QueryTreeItem = TreeViewBaseItem<{ isFolder: boolean; queryId: string }>;

function toTreeItems(nodes: QueryTreeNode[]): QueryTreeItem[] {
  return nodes.map(node => ({
    id: node.id,
    label: node.name,
    isFolder: node.isFolder,
    queryId: node.id,
    children: node.children ? toTreeItems(node.children) : undefined,
  }));
}

function findNode(nodes: QueryTreeNode[], id: string): QueryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function collectFolderIds(nodes: QueryTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.isFolder) {
      ids.push(node.id);
      if (node.children) ids.push(...collectFolderIds(node.children));
    }
  }
  return ids;
}

function flattenQueries(nodes: QueryTreeNode[]): QueryTreeNode[] {
  const result: QueryTreeNode[] = [];
  for (const node of nodes) {
    if (!node.isFolder) result.push(node);
    if (node.children) result.push(...flattenQueries(node.children));
  }
  return result;
}

function filterTree(nodes: QueryTreeNode[], search: string): QueryTreeNode[] {
  const q = search.toLowerCase();
  return nodes.flatMap(node => {
    if (node.isFolder) {
      const children = filterTree(node.children ?? [], q);
      return children.length > 0 ? [{ ...node, children }] : [];
    }
    return node.name.toLowerCase().includes(q) || node.id.toLowerCase().includes(q) ? [node] : [];
  });
}

const TREE_SX = { minHeight: 300, flexGrow: 1 } as const;

export function QuerySelector({
  open,
  orgUrl,
  teamProject,
  credential,
  mode,
  selectedId,
  onSelect,
  onClose,
}: QuerySelectorProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<QueryTreeNode[]>([]);
  const [pendingId, setPendingId] = useState<string>(selectedId);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !teamProject) return;
    setSearch('');
    setLoading(true);
    setError(null);
    let cancelled = false; // N3: stale-response guard for rapid open/close or project change
    const ctx: AuthCtx = { orgUrl, credential };
    (mode === 'extension'
      ? fetchQueriesDirect(orgUrl, credential, teamProject)
      : fetchQueries(teamProject, ctx))
      .then(data => { if (!cancelled) setRoots(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 401 || status === 403) {
          setError('Authentication failed. Check your PAT and project access.');
        } else if (!status) {
          setError('Cannot reach the server. Check your network connection.');
        } else {
          setError('Failed to load queries. Check project name and permissions.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orgUrl, credential, teamProject, mode]);

  const filteredRoots = useMemo(
    () => search.trim() ? filterTree(roots, search.trim()) : roots,
    [roots, search]
  );
  const treeItems = useMemo(() => toTreeItems(filteredRoots), [filteredRoots]);
  const defaultExpanded = useMemo(() => collectFolderIds(filteredRoots), [filteredRoots]);

  const allQueries = useMemo(() => flattenQueries(roots), [roots]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setSearch(val);
    // If input looks like a GUID (query ID), auto-select if found
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(val.trim())) {
      const match = allQueries.find(q => q.id.toLowerCase() === val.trim().toLowerCase());
      if (match) setPendingId(match.id);
    }
  };

  const handleItemClick = useCallback((_e: React.SyntheticEvent, itemId: string) => {
    const node = findNode(roots, itemId);
    if (node && !node.isFolder) setPendingId(itemId);
  }, [roots]);

  // M11: memoize so findNode O(n) tree walk only runs when roots or pendingId changes
  const pendingNode = useMemo(
    () => roots.length > 0 ? findNode(roots, pendingId) : null,
    [roots, pendingId]
  );
  const canConfirm = !!pendingNode && !pendingNode.isFolder;

  const handleConfirm = (): void => {
    if (pendingNode && !pendingNode.isFolder) {
      onSelect(pendingNode.id, pendingNode.name);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Browse Queries</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 360 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search by name or paste a Query ID…"
          value={search}
          onChange={handleSearchChange}
          autoFocus
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                </InputAdornment>
              ),
            },
          }}
        />
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
            <CircularProgress size={32} />
          </Box>
        )}
        {error && (
          <Typography color="error" variant="body2">{error}</Typography>
        )}
        {!loading && !error && treeItems.length > 0 && (
          <RichTreeView
            items={treeItems}
            defaultExpandedItems={defaultExpanded}
            selectedItems={pendingId}
            onItemClick={handleItemClick}
            sx={TREE_SX}
            slots={{
              collapseIcon: FolderOpenIcon,
              expandIcon: FolderIcon,
              endIcon: QueryStatsIcon,
            }}
          />
        )}
        {!loading && !error && treeItems.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No queries found in this project.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        {pendingNode && !pendingNode.isFolder && (
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }} noWrap>
            Selected: {pendingNode.name}
          </Typography>
        )}
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!canConfirm}>
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}
