import { SEED_LINK_TYPES } from './adoLinkTypes';

// ─── Link-rel chip helpers + colors ─────────────────────────────────────────
// Moved out of TreeRow.tsx so the Legend popover can reference the exact same
// colors/labels instead of duplicating hex values (single source of truth).

const SEED_DISPLAY_MAP: Record<string, string> = Object.fromEntries(
  SEED_LINK_TYPES.map(lt => [lt.referenceName, lt.displayName])
);

export const REL_FAMILY_COLORS: Record<string, string> = {
  Hierarchy: '#1B458F',
  Related:   '#6B7280',
  Affects:   '#D97706',
  TestedBy:  '#059669',
  CoveredBy: '#7C3AED',
};

export function relDisplayName(ref: string): string {
  if (SEED_DISPLAY_MAP[ref]) return SEED_DISPLAY_MAP[ref];
  const last = ref.split('.').pop() ?? ref;
  return last.replace(/-Forward$|-Reverse$/, '');
}

// Chip label omits the " (Hierarchy)" suffix — every plain parent-child row would otherwise
// repeat it; the full name (e.g. "Child (Hierarchy)") is still available via the chip's title tooltip.
export function relChipLabel(ref: string): string {
  return relDisplayName(ref).replace(/\s*\(Hierarchy\)$/, '');
}

export function relFamilyColor(ref: string): string {
  const family = (ref.split('.').pop() ?? '').replace(/-Forward$|-Reverse$/, '');
  return REL_FAMILY_COLORS[family] ?? '#6B7280';
}

// Amber tint for nodes reached only via the selected-link-type recursive expansion
// (scaffolding beyond the source query's own results) — same chip, different color + icon.
export const DISCOVERED_REL_COLOR = '#B45309';

// Distinct color for the cut-cycle indicator — a link the tree builder dropped to avoid
// infinite recursion (it would loop back to an ancestor already on this branch).
export const CUT_CYCLE_COLOR = '#7C3AED';

// Distinct color for the multi-parent indicator — this item is a directional-spine child
// under 2+ distinct parents (diamond / likely mis-link), separate from a true cycle.
export const MULTI_PARENT_COLOR = '#DC2626';

// Distinct color for a placeholder whose id never resolved because the current token has
// no access to it (vs a deleted/unexplained placeholder) — see TreeNode.placeholderReason.
export const RESTRICTED_COLOR = '#B91C1C';
