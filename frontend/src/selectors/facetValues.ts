export interface FacetValues {
  types: string[];
  states: string[];
}

/**
 * Derives sorted unique type and state values from the rowsById map.
 * Pure function — no React or MUI imports.
 */
export function getFacetValues(
  rowsById: Record<string | number, { type: string; state: string }>,
): FacetValues {
  const typesSet = new Set<string>();
  const statesSet = new Set<string>();

  for (const row of Object.values(rowsById)) {
    if (row.type) typesSet.add(row.type);
    if (row.state) statesSet.add(row.state);
  }

  return {
    types: Array.from(typesSet).sort(),
    states: Array.from(statesSet).sort(),
  };
}
