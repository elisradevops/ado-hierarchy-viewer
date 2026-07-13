import type { QueryColumn } from '../types/ado';

/**
 * Single source of truth for hierarchy table columns.
 * Each entry drives: header label, row cell rendering, sort key, grid track width,
 * and (for optional columns) the ADO field reference name used to determine visibility.
 *
 * Visibility rule (HierarchyTreeTable):
 *   - always: true  → always shown (Title/Type/State + the computed Progress/Time rollups)
 *   - field present, query declares columns → shown only if the query's own column set
 *     includes that field (augmented — see buildDynamicColumns below for the query's
 *     columns that aren't in this fixed list at all)
 *   - field present, query has no column metadata (older BFF, or none returned) → falls
 *     back to "at least one loaded WIT type supports that field" (previous behavior)
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
  { key: 'priority',         label: 'Priority',          width: '80px',  align: 'right', field: 'Microsoft.VSTS.Common.Priority' },
  { key: 'tags',             label: 'Tags',              width: '100px',           field: 'System.Tags',              defaultVisible: false },
  // Effort group — kept contiguous so scanning estimate-vs-actual is a straight horizontal read.
  { key: 'storyPoints',      label: 'Story Points',      width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.StoryPoints',       defaultVisible: false },
  { key: 'originalEstimate', label: 'Original Estimate', width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.OriginalEstimate' },
  { key: 'remainingWork',    label: 'Remaining Work',    width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.RemainingWork' },
  { key: 'completedWork',    label: 'Completed Work',    width: '100px', align: 'right', field: 'Microsoft.VSTS.Scheduling.CompletedWork',     defaultVisible: false },
  // Computed rollups — always shown; not tied to any single fetched field.
  { key: 'progressPct',      label: 'Progress',          width: '165px', always: true },
  { key: 'time',             label: 'Time',              width: '150px', always: true },
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
export function buildMinTableWidth(cols: ColumnDef[], titleMin = 280, colWidths?: Record<string, number>): number {
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

/** Prefix for synthetic column keys built from a query's own (non-fixed) columns —
 *  lets TreeRow/HierarchyTreeTable distinguish "known field, fixed ColumnDef" from
 *  "arbitrary query column, read from TreeNode.extraFields at render time". */
export const DYNAMIC_COL_PREFIX = 'x:';

export function dynamicColKey(referenceName: string): string {
  return `${DYNAMIC_COL_PREFIX}${referenceName}`;
}

// Title/Type/State (and the id shown inline in the Title cell) are always displayed but have
// no ColumnDef.field — they're read directly off TreeNode.id/type/title/state, not looked up
// by ADO reference name like the other fixed columns. If a query explicitly SELECTs these
// (System.Id/System.WorkItemType/System.Title/System.State — a very common baseline query
// shape), they must still be excluded from dynamic columns, or they render as duplicate,
// always-empty columns (BFF/adoDirect's own knownFields already excludes these from
// extraFields, so the dynamic column would only ever show "—" anyway).
const ALWAYS_DISPLAYED_FIELDS = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State'];

// COLUMN_DEFS is static, so its field set only needs to be computed once.
const FIXED_COLUMN_FIELDS = new Set([
  ...COLUMN_DEFS.map(c => c.field).filter((f): f is string => !!f),
  ...ALWAYS_DISPLAYED_FIELDS,
]);

/** Builds one ColumnDef per query column that isn't already covered by a fixed
 *  ColumnDef.field — i.e. genuinely custom fields the baseline query asked for.
 *  Order is the query's own column order; callers splice these in ahead of the
 *  always-shown computed tail (Progress/Time).
 *  `effortField`, when given, is also excluded — when the org's configured effort field
 *  is also one of the query's own declared columns, its value is already shown via the
 *  Progress/Time columns and would otherwise render a second time as a redundant column. */
export function buildDynamicColumns(queryColumns: QueryColumn[], effortField?: string | null): ColumnDef[] {
  return queryColumns
    .filter(c => !FIXED_COLUMN_FIELDS.has(c.referenceName) && c.referenceName !== effortField)
    .map(c => ({
      key: dynamicColKey(c.referenceName),
      label: c.name,
      width: '120px',
      field: c.referenceName,
    }));
}
