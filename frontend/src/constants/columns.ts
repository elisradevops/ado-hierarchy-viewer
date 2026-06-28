/**
 * Single source of truth for hierarchy table columns.
 * Each entry drives: header label, row cell rendering, sort key, grid track width,
 * and (for optional columns) the ADO field reference name used to determine visibility.
 *
 * Visibility rule (HierarchyTreeTable):
 *   - always: true  → always shown
 *   - field present → shown only when at least one loaded WIT type supports that field
 *   - no field, not always → always shown (computed columns like effort/progress)
 */

export interface ColumnDef {
  key: string;
  label: string;
  width: string;         // CSS grid track (px or minmax)
  align?: 'right';
  /** ADO field reference name — if set, column is hidden when no WIT in the result set supports this field */
  field?: string;
  /** Always shown regardless of project type */
  always?: true;
  /**
   * When false, column is hidden by default until the user opts it in via the Columns menu.
   * Omitting this field (or true) = default-visible.
   */
  defaultVisible?: boolean;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'title',            label: 'Title',             width: 'minmax(0, 1fr)',  always: true },
  { key: 'type',             label: 'Type',              width: '120px',           always: true },
  { key: 'state',            label: 'State',             width: '110px',           always: true },
  { key: 'assignedTo',       label: 'Assigned To',       width: '140px',           field: 'System.AssignedTo' },
  { key: 'areaPath',         label: 'Area Path',         width: '180px',           field: 'System.AreaPath',          defaultVisible: false },
  { key: 'iterationPath',    label: 'Iteration Path',    width: '180px',           field: 'System.IterationPath',     defaultVisible: false },
  { key: 'storyPoints',      label: 'Story Points',      width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.StoryPoints',       defaultVisible: false },
  { key: 'remainingWork',    label: 'Remaining Work',    width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.RemainingWork',     defaultVisible: false },
  { key: 'originalEstimate', label: 'Original Estimate', width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.OriginalEstimate',  defaultVisible: false },
  { key: 'priority',         label: 'Priority',          width: '80px',  align: 'right', field: 'Microsoft.VSTS.Common.Priority' },
  { key: 'tags',             label: 'Tags',              width: '100px',           field: 'System.Tags',              defaultVisible: false },
  { key: 'progressPct',      label: 'Progress',          width: '165px' },
  { key: 'effort',           label: 'Effort',            width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.OriginalEstimate' },
  { key: 'effortTotal',      label: 'Total Effort',      width: '110px', align: 'right' },
  { key: 'time',             label: 'Time',              width: '150px', field: 'Microsoft.VSTS.Scheduling.RemainingWork' },
];

/** Minimum column width enforced during drag-to-resize (px). */
export const COLUMN_MIN_PX = 60;

/** Build a CSS Grid template string from a list of column defs.
 *  When colWidths contains an override for a column key, that px value is used
 *  instead of the column's default width track.
 *  Elastic columns (minmax tracks) keep their elasticity — the override becomes
 *  the floor so the column never shrinks below the user's chosen width but still
 *  expands to fill available space. Fixed-px columns become the exact override px. */
export function buildGridCols(cols: ColumnDef[], colWidths?: Record<string, number>): string {
  return cols.map(c => {
    const override = colWidths?.[c.key];
    if (override === undefined) return c.width;
    return c.width.startsWith('minmax') ? `minmax(${override}px, 1fr)` : `${override}px`;
  }).join(' ');
}

/** Minimum px width for the table based on the currently visible columns.
 *  User-overridden widths are respected so SCROLL_INNER/BODY_WRAPPER/Virtuoso
 *  stay wide enough to actually render all row content without clipping. */
export function buildMinTableWidth(cols: ColumnDef[], titleMin = 200, colWidths?: Record<string, number>): number {
  let total = 0;
  for (const col of cols) {
    if (col.key === 'title') {
      total += colWidths?.['title'] ?? titleMin;
      continue;
    }
    const override = colWidths?.[col.key];
    if (override !== undefined) { total += override; continue; }
    const m = col.width.match(/^(\d+)px$/);
    if (m) total += parseInt(m[1], 10);
  }
  return total;
}
