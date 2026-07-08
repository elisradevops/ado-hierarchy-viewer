import React, { useMemo, useState } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Button, Typography } from '@mui/material';
import { stripHtmlToText } from '../utils/htmlFieldText';
import { sanitizeRichHtml } from '../utils/sanitizeRichText';

const PREVIEW_SX = {
  fontSize: '0.8125rem',
  color: 'text.primary',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline' },
} as const;

// Styles the allowlisted structural tags (see sanitizeRichText.ts) to match the app's existing
// typography — no color overrides, DOMPurify already stripped any inline color/font the source
// had, so only spacing/sizing is set here.
const DIALOG_BODY_SX = {
  fontSize: '0.875rem',
  lineHeight: 1.6,
  '& p': { m: 0, mb: 1.5, '&:last-child': { mb: 0 } },
  '& ul, & ol': { m: 0, mb: 1.5, pl: 3 },
  '& li': { mb: 0.5 },
  '& h1, & h2, & h3, & h4, & h5, & h6': { fontSize: '1em', fontWeight: 700, m: 0, mb: 1 },
  '& blockquote': { m: 0, mb: 1.5, pl: 2, borderLeft: '3px solid', borderColor: 'divider' },
} as const;

export interface HtmlFieldCellProps {
  /** The dynamic column's display name — used as the dialog title. */
  label: string;
  /** The raw HTML value from TreeNode.extraFields. */
  rawValue: string;
}

/**
 * Renders an ADO rich-text field (Description, Repro Steps, etc.) as a truncated plain-text
 * preview (stripHtmlToText — no markup risk), expandable via click into a Dialog showing the
 * field's sanitized rich-text structure (paragraphs/lists/headings/bold, no color or fonts —
 * see sanitizeRichText.ts). DOMPurify's output is safe to render via dangerouslySetInnerHTML —
 * that's the whole point of sanitizing first.
 */
export function HtmlFieldCell({ label, rawValue }: HtmlFieldCellProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const previewText = useMemo(() => stripHtmlToText(rawValue), [rawValue]);
  const sanitizedHtml = useMemo(() => sanitizeRichHtml(rawValue), [rawValue]);

  return (
    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
      <Typography
        sx={PREVIEW_SX}
        noWrap
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        {previewText || '—'}
      </Typography>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth onClick={(e) => e.stopPropagation()}>
        <DialogTitle sx={{ pb: 1 }}>{label}</DialogTitle>
        <DialogContent dividers>
          {sanitizedHtml
            ? <Box sx={DIALOG_BODY_SX} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            : <Typography sx={DIALOG_BODY_SX}>—</Typography>
          }
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
