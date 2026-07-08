/**
 * Canonical Azure DevOps link-type reference names.
 *
 * Adapted from elisra-mcp-ado/src/domain/adoLinkTypes.ts.
 * Uses substring matching ('Affects', 'CoveredBy') on relation.rel for
 * traceability classification — mirrors DocGen's precedent.
 */
export const ADO_LINK_TYPES = {
  // Built-in hierarchy
  HIERARCHY_FORWARD: 'System.LinkTypes.Hierarchy-Forward', // Parent → Children
  HIERARCHY_REVERSE: 'System.LinkTypes.Hierarchy-Reverse', // Child → Parent

  // Generic
  RELATED: 'System.LinkTypes.Related',

  // Affects (built-in CMMI)
  AFFECTS_FORWARD: 'System.LinkTypes.Affects-Forward',
  AFFECTS_REVERSE: 'System.LinkTypes.Affects-Reverse',

  // Test coverage
  TESTED_BY_FORWARD: 'Microsoft.VSTS.Common.TestedBy-Forward',
  TESTED_BY_REVERSE: 'Microsoft.VSTS.Common.TestedBy-Reverse',

  // Elisra project-custom link types
  ELISRA_COVERED_BY_FORWARD: 'Elisra.CoveredBy-Forward', // system req covers customer req
  ELISRA_COVERED_BY_REVERSE: 'Elisra.CoveredBy-Reverse', // customer req covered by system req
} as const;

// Seed catalog for display-name lookup in relationship chips
export interface LinkTypeSeedEntry {
  referenceName: string;
  displayName: string;
  isCustom: boolean;
}

/** True for link types without a -Forward/-Reverse suffix (e.g. Related) — reciprocal by nature, not a directional spine. */
export function isSymmetric(rel: string | undefined): boolean {
  if (!rel) return false;
  return !rel.endsWith('-Forward') && !rel.endsWith('-Reverse');
}

export const SEED_LINK_TYPES: readonly LinkTypeSeedEntry[] = [
  { referenceName: ADO_LINK_TYPES.HIERARCHY_FORWARD, displayName: 'Child (Hierarchy)', isCustom: false },
  { referenceName: ADO_LINK_TYPES.HIERARCHY_REVERSE, displayName: 'Parent (Hierarchy)', isCustom: false },
  { referenceName: ADO_LINK_TYPES.RELATED, displayName: 'Related', isCustom: false },
  { referenceName: ADO_LINK_TYPES.AFFECTS_FORWARD, displayName: 'Affects', isCustom: false },
  { referenceName: ADO_LINK_TYPES.AFFECTS_REVERSE, displayName: 'Affected By', isCustom: false },
  { referenceName: ADO_LINK_TYPES.TESTED_BY_FORWARD, displayName: 'Tested By', isCustom: false },
  { referenceName: ADO_LINK_TYPES.TESTED_BY_REVERSE, displayName: 'Tests', isCustom: false },
  { referenceName: ADO_LINK_TYPES.ELISRA_COVERED_BY_FORWARD, displayName: 'Covers', isCustom: true },
  { referenceName: ADO_LINK_TYPES.ELISRA_COVERED_BY_REVERSE, displayName: 'Covered By', isCustom: true },
];
