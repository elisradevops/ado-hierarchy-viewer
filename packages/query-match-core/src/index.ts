// Pure, transport-agnostic query-match logic shared between the BFF (Node, raw REST
// JSON via AdoClient) and the ADO extension (browser, azure-devops-extension-api SDK
// client). Both transports fetch data differently (HTTP POST vs SDK queryByWiql; a
// lowercased-string queryType vs the SDK's numeric QueryType enum) — this package holds
// only the logic that is byte-for-byte identical either way, so the two transports
// cannot drift out of sync the way they previously did as hand-duplicated copies.

export interface WorkItemFieldReference {
  name: string;
  referenceName: string;
}

export interface WorkItemQueryClause {
  clauses: WorkItemQueryClause[];
  field: WorkItemFieldReference | null;
  fieldValue: WorkItemFieldReference | null;
  isFieldValue: boolean;
  /**
   * BFF's raw REST JSON serializes this as a string ('And'/'Or', casing varies by ADO
   * version); the extension SDK's typed client returns the numeric LogicalOperation enum
   * (NONE=0, AND=1, OR=2) instead. Both forms are accepted so this one implementation
   * serves both transports without either needing its own copy.
   */
  logicalOperator: string | number | null;
  operator: WorkItemFieldReference | null;
  value: string | null;
}

/** Normalized query shape, independent of either transport's raw representation. */
export type NormalizedQueryType = 'flat' | 'tree' | 'oneHop' | 'unknown';

// Maps ADO's structured-clause operator reference names (e.g. "SupportedOperations.Equals")
// to their literal WIQL syntax token. Empirically confirmed against a real ADO Server
// response: operators come back as these semantic reference names, NOT literal symbols.
// Anything not in this map bails (fail-closed) — a wrong mapping would only ever produce
// invalid WIQL (caught as a request error → null), never a silently-wrong match set.
export const OPERATOR_TO_WIQL: Record<string, string> = {
  'SupportedOperations.Equals': '=',
  'SupportedOperations.NotEquals': '<>',
  'SupportedOperations.GreaterThan': '>',
  'SupportedOperations.LessThan': '<',
  'SupportedOperations.GreaterThanEquals': '>=',
  'SupportedOperations.LessThanEquals': '<=',
  'SupportedOperations.Contains': 'Contains',
  'SupportedOperations.ContainsWords': 'Contains Words',
  'SupportedOperations.DoesNotContain': 'Does Not Contain',
  'SupportedOperations.DoesNotContainWords': 'Does Not Contain Words',
  'SupportedOperations.Under': 'Under',
  'SupportedOperations.NotUnder': 'Not Under',
  'SupportedOperations.In': 'In',
  'SupportedOperations.NotIn': 'Not In',
  'SupportedOperations.InGroup': 'In Group',
  'SupportedOperations.NotInGroup': 'Not In Group',
  'SupportedOperations.WasEver': 'Was Ever',
};

// Operators whose value is a comma-separated list needing per-item quoting/wrapping,
// rather than a single literal.
export const LIST_OPERATORS = new Set(['In', 'Not In', 'In Group', 'Not In Group']);

// LinkQueryMode.LinksOneHopDoesNotContain = 3, LinksRecursiveDoesNotContain = 6
const DOES_NOT_CONTAIN_NUMERIC_VALUES = new Set([3, 6]);

/**
 * DoesNotContain modes invert match semantics (source matches ONLY WHEN no linked item
 * satisfies the target clause) — a plain union of the two clause buckets would be
 * actively wrong here, not just incomplete. Callers should bail entirely rather than
 * attempt to derive matches when this returns true.
 */
export function isDoesNotContainMode(filterOptions: string | number | undefined): boolean {
  if (filterOptions === undefined) return false;
  if (typeof filterOptions === 'number') return DOES_NOT_CONTAIN_NUMERIC_VALUES.has(filterOptions);
  return filterOptions.toLowerCase().includes('doesnotcontain');
}

/**
 * Resolves the two transports' differing queryType representations (BFF: lowercased
 * string from raw REST JSON; extension: numeric QueryType enum from the SDK) to one
 * normalized value, so both sides route through identical branching logic instead of
 * maintaining separate comparisons that can silently drift apart.
 */
export function normalizeQueryType(value: string | number | undefined | null): NormalizedQueryType {
  if (typeof value === 'number') {
    if (value === 1) return 'flat';
    if (value === 2) return 'tree';
    if (value === 3) return 'oneHop';
    return 'unknown';
  }
  const lower = (value ?? '').toLowerCase();
  if (lower === 'flat') return 'flat';
  if (lower === 'tree') return 'tree';
  if (lower === 'onehop') return 'oneHop';
  return 'unknown';
}

export function escapeWiqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function isUnresolvableMacro(value: string): boolean {
  // @CurrentIteration(s) needs team context we don't have when re-issuing this query;
  // resolving it against the wrong/default team would silently produce wrong matches.
  return /^@currentiterations?\b/i.test(value.trim());
}

/**
 * Recursively renders a WorkItemQueryClause tree into a WIQL WHERE fragment.
 * Returns null (fail-closed) on any unrecognized shape/operator.
 */
export function renderClauseTree(clause: WorkItemQueryClause | null | undefined): string | null {
  if (!clause) return null;

  // Logical group (has child clauses) — render + join children, wrap in parens.
  if (clause.clauses && clause.clauses.length > 0) {
    const rendered: string[] = [];
    for (let i = 0; i < clause.clauses.length; i++) {
      const child = clause.clauses[i];
      const piece = renderClauseTree(child);
      if (piece === null) return null; // one unrenderable child bails the whole group

      if (i === 0) {
        rendered.push(piece);
      } else {
        // Numeric form: extension SDK's LogicalOperation.OR = 2. String form: BFF's raw
        // REST JSON, defensive against casing variance across ADO versions ('OR' vs 'Or').
        const opValue = child.logicalOperator;
        const isOr = typeof opValue === 'number'
          ? opValue === 2
          : String(opValue ?? '').toUpperCase() === 'OR';
        rendered.push(`${isOr ? 'OR' : 'AND'} ${piece}`);
      }
    }
    return `(${rendered.join(' ')})`;
  }

  // Leaf clause
  const field = clause.field?.referenceName;
  const operatorRef = clause.operator?.referenceName;
  if (!field || !operatorRef) return null;
  const wiqlOp = OPERATOR_TO_WIQL[operatorRef];
  if (!wiqlOp) return null;

  if (clause.isFieldValue) {
    const fieldValueRef = clause.fieldValue?.referenceName;
    if (!fieldValueRef) return null;
    return `[${field}] ${wiqlOp} [${fieldValueRef}]`;
  }

  const rawValue = clause.value ?? '';
  if (isUnresolvableMacro(rawValue)) return null;

  if (LIST_OPERATORS.has(wiqlOp)) {
    const items = rawValue.split(',').map(v => v.trim()).filter(Boolean);
    if (items.length === 0) return null;
    const rendered = items.map(v => `'${escapeWiqlLiteral(v)}'`).join(',');
    return `[${field}] ${wiqlOp} (${rendered})`;
  }

  const isMacro = rawValue.trim().startsWith('@');
  const rendered = isMacro ? rawValue.trim() : `'${escapeWiqlLiteral(rawValue)}'`;
  return `[${field}] ${wiqlOp} ${rendered}`;
}

/**
 * Unions the source/target clause-bucket match ids and filters to only ids actually
 * present in the built tree. Returns null when both buckets are undeterminable —
 * fail-closed, matching each transport's own null-propagation for unrenderable clauses.
 */
export function unionAndFilterMatches(
  sourceIds: number[] | null,
  targetIds: number[] | null,
  presentIds: ReadonlySet<number>
): number[] | null {
  if (sourceIds === null && targetIds === null) return null;
  const union = new Set<number>([...(sourceIds ?? []), ...(targetIds ?? [])]);
  return [...union].filter(id => presentIds.has(id));
}
