import React, { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import axios from 'axios';
import { useConnectionStore } from '../state/connectionStore';
import { httpClient } from '../api/httpClient';
import { buildAuthHeaders } from '../api/authHeaders';
import { normalizeAdoOrgUrl } from '../utils/adoUrlUtils';
import { storage, cookies } from '../utils/storage';

const LAST_ORG_KEY = 'lastOrgUrl';

const ROOT_SX = { display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' } as const;

const BRAND_PANEL_SX = {
  width: 320,
  flexShrink: 0,
  bgcolor: 'primary.main',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 2.5, pt: '18vh', pb: 6,
  px: 4,
  
} as const;

const BRAND_ICON_WRAP_SX = {
  width: 68,
  height: 68,
  borderRadius: '50%',
  bgcolor: 'rgba(255,255,255,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
} as const;

const BRAND_TITLE_SX = { color: '#fff', fontWeight: 700, textAlign: 'center' as const, lineHeight: 1.2 } as const;
const BRAND_SUB_SX = { color: 'rgba(255,255,255,0.65)', textAlign: 'center' as const, fontSize: '0.85rem', lineHeight: 1.6 } as const;
const BRAND_FEATURES_SX = { display: 'flex', flexDirection: 'column' as const, gap: 1, mt: 0.5, alignSelf: 'stretch' as const } as const;
const FEATURE_ITEM_SX = { display: 'flex', alignItems: 'center', gap: 1.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.8rem' } as const;
const FEATURE_DOT_SX = { width: 5, height: 5, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.35)', flexShrink: 0 } as const;

const FORM_PANEL_SX = { flexGrow: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'flex-start', pt: '14vh', px: 6 } as const;
const FORM_INNER_SX = { width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column' as const } as const;
const HEADING_SX = { fontWeight: 700, mb: 0.5, color: 'text.primary' } as const;
const SUB_SX = { color: 'text.secondary', mb: 3.5, fontSize: '0.875rem' } as const;

const FEATURES = [
  'Interactive tree with expand / collapse',
  'Progress & effort rollups per branch',
  'Filter by type, state, or keyword',
  'Auto-refresh · CSV / clipboard export',
];

export function LoginForm(): React.ReactElement {
  const [orgUrl, setOrgUrl] = useState(storage.local.get(LAST_ORG_KEY) ?? '');
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMutatingRef = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  const connectStandalone = useConnectionStore(s => s.connectStandalone);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const normalizedUrl = normalizeAdoOrgUrl(orgUrl);
    if (!normalizedUrl) { setError('Please enter a valid organization URL'); return; }
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    setIsMutating(true);
    setError(null);
    try {
      await httpClient.get('/health', { headers: buildAuthHeaders(normalizedUrl, pat) });
      storage.local.set(LAST_ORG_KEY, normalizedUrl);
      cookies.set('orgUrl', normalizedUrl);
      cookies.set('pat', pat);
      connectStandalone(normalizedUrl, pat);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) setError('Credentials rejected — verify your Personal Access Token.');
        else if (status && status >= 500) setError('Server error — the BFF or ADO Server may be unavailable.');
        else if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED') setError('Cannot reach server — check the Organization URL.');
        else setError('Could not connect. Please check your organization URL and PAT.');
      } else {
        setError('Could not connect. Please check your organization URL and PAT.');
      }
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  };

  return (
    <Box sx={ROOT_SX}>
      <Box sx={BRAND_PANEL_SX}>
        <Box sx={BRAND_ICON_WRAP_SX}>
          <AccountTreeIcon sx={{ fontSize: 34, color: 'rgba(255,255,255,0.9)' }} />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={BRAND_TITLE_SX}>ADO Hierarchy Viewer</Typography>
          <Typography sx={BRAND_SUB_SX}>Visualize work item link hierarchies from Azure DevOps in real time.</Typography>
        </Box>
        <Box sx={BRAND_FEATURES_SX}>
          {FEATURES.map(f => (
            <Box key={f} sx={FEATURE_ITEM_SX}><Box sx={FEATURE_DOT_SX} />{f}</Box>
          ))}
        </Box>
      </Box>

      <Box sx={FORM_PANEL_SX}>
        <Box sx={FORM_INNER_SX}>
          <Typography variant="h5" sx={HEADING_SX}>Connect</Typography>
          <Typography sx={SUB_SX}>Sign in with your Azure DevOps credentials</Typography>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          <Box component="form" onSubmit={(e) => { void handleSubmit(e); }}>
            <TextField fullWidth label="Organization URL" placeholder="https://your-server/tfs/DefaultCollection"
              value={orgUrl} onChange={e => setOrgUrl(e.target.value)} required disabled={isMutating} sx={{ mb: 2 }}
            />
            <TextField fullWidth label="Personal Access Token" type={showPat ? 'text' : 'password'}
              value={pat} onChange={e => setPat(e.target.value)} required disabled={isMutating}
              helperText="Needs Work (read) scope · Session saved in browser cookie" sx={{ mb: 3 }}
              slotProps={{ input: { endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPat(p => !p)} edge="end"
                    aria-label={showPat ? 'Hide token' : 'Show token'}>
                    {showPat ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ) } }}
            />
            <Button type="submit" variant="contained" fullWidth size="large"
              disabled={isMutating || !orgUrl || !pat}
              startIcon={isMutating ? <CircularProgress size={16} color="inherit" /> : null}>
              {isMutating ? 'Connecting…' : 'Connect'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
