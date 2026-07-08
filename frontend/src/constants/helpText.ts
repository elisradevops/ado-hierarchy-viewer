import { REL_FAMILY_COLORS, DISCOVERED_REL_COLOR, CUT_CYCLE_COLOR, MULTI_PARENT_COLOR, RESTRICTED_COLOR } from '../domain/legendMeta';
import { STATE_DOT_COLORS } from './stateColors';
import { TYPE_COLORS } from '../components/TreeRow';

// ─── Per-field help copy ─────────────────────────────────────────────────────
// Single source of truth for the longer "what/why" explanations shown by <InfoTip>.
// Short helperText strings on the fields themselves are unchanged — this is the
// deeper explanation reached by clicking the (?) icon.
export const HELP = {
  teamProject: 'The Azure DevOps team project to load work items from. In the ADO extension, this is fixed to the project you\'re already inside.',
  sourceQuery: 'A saved Azure DevOps query whose results seed the hierarchy tree. This is the required starting point — every root item in the tree comes from this query.',
  linkTypes: 'Optional. Once the tree is seeded from the Source Query, these link types are followed outward to discover more connected items beyond the query\'s own results (shown with an amber "discovered" chip).',
  showOnlyMatches: 'When on, only items returned directly by the Source Query are shown — items found by following Link Types outward are hidden.',
  density: 'Comfortable uses taller rows for readability; Compact packs more rows on screen.',
} as const;

// ─── Legend data ─────────────────────────────────────────────────────────────
// Drives the toolbar Legend popover. Colors are imported from the same constants
// TreeRow uses to render chips — never duplicate a hex value here.
export interface LegendItem {
  color: string;
  label: string;
  description: string;
}

export interface LegendGroup {
  title: string;
  items: LegendItem[];
}

export const LEGEND_GROUPS: LegendGroup[] = [
  {
    title: 'Relationship chips',
    items: [
      { color: REL_FAMILY_COLORS.Hierarchy, label: 'Child / Parent', description: 'Built-in Azure DevOps parent-child hierarchy link.' },
      { color: REL_FAMILY_COLORS.Related, label: 'Related', description: 'Generic, non-directional link between two work items.' },
      { color: REL_FAMILY_COLORS.Affects, label: 'Affects / Affected By', description: 'Built-in Azure DevOps Affects link.' },
      { color: REL_FAMILY_COLORS.TestedBy, label: 'Tested By / Tests', description: 'Test-to-requirement coverage link.' },
      { color: REL_FAMILY_COLORS.CoveredBy, label: 'Covers / Covered By', description: 'Elisra-custom requirement coverage link.' },
      { color: DISCOVERED_REL_COLOR, label: 'Discovered', description: 'Item found by following a selected Link Type outward — not part of the Source Query\'s own results.' },
    ],
  },
  {
    title: 'Warning indicators',
    items: [
      { color: CUT_CYCLE_COLOR, label: 'Cycle', description: 'A link back to an ancestor already on this branch was dropped to avoid an infinite loop.' },
      { color: MULTI_PARENT_COLOR, label: 'Duplicate link', description: 'This item already exists under another parent (a diamond / likely mis-link).' },
      { color: RESTRICTED_COLOR, label: 'No access', description: 'This linked item never resolved because the current token/PAT has no access to it.' },
    ],
  },
  {
    title: 'Work item types',
    // Colors come straight from TreeRow's TYPE_COLORS — the same palette used to render
    // type badges/dots in the tree. A live project's own colors (API-fetched) may differ
    // slightly; this shows the hardcoded fallback palette.
    items: Object.entries(TYPE_COLORS).map(([label, color]) => ({ color, label, description: '' })),
  },
  {
    title: 'States',
    items: Object.entries(STATE_DOT_COLORS).map(([label, color]) => ({
      color, label: label.charAt(0).toUpperCase() + label.slice(1), description: '',
    })),
  },
];
