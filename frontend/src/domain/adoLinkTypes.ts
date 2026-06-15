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

export type AdoLinkType = (typeof ADO_LINK_TYPES)[keyof typeof ADO_LINK_TYPES];

// Tokens for substring-based matching (matches both -Forward and -Reverse variants + custom namespaces)
export const TRACEABILITY_TOKENS = ['Affects', 'CoveredBy'] as const;

// Link types that are NOT work-item relations (file attachments, hyperlinks, etc.)
export const NON_WI_RELATION_TYPES = new Set([
  'AttachedFile',
  'Hyperlink',
  'ArtifactLink',
]);

export function isTraceabilityRel(rel: string): boolean {
  return TRACEABILITY_TOKENS.some(token => rel.includes(token));
}

export function isWorkItemRel(rel: string): boolean {
  return !NON_WI_RELATION_TYPES.has(rel);
}

/**
 * Resolve a user-facing input (display name, partial name, or full reference name)
 * to a canonical reference name.
 * Falls back to the input itself if no match found (pass-through for dynamically discovered types).
 */
export function resolveRelationType(input: string): string {
  const normalized = input.trim().toLowerCase();
  for (const refName of Object.values(ADO_LINK_TYPES)) {
    if (refName.toLowerCase() === normalized) return refName;
    // Match by last segment: 'Hierarchy-Forward' matches 'System.LinkTypes.Hierarchy-Forward'
    const lastSegment = refName.split('.').pop()?.toLowerCase();
    if (lastSegment && lastSegment === normalized) return refName;
  }
  return input.trim();
}

// Seed catalog for populating the RelationType dropdown before dynamic discovery
export interface LinkTypeSeedEntry {
  referenceName: string;
  displayName: string;
  isCustom: boolean;
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
