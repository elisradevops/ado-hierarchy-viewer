import { AdoClient } from './AdoClient';
import { logger } from '../utils/logger';

// ADO tree/oneHop queries can pull in ancestor/sibling scaffolding beyond the actual
// filter matches (e.g. a Closed-Task-in-Sprint-1 filter still shows the whole parent
// User Story's subtree, any state/iteration). ADO's WIQL execution response has no
// per-item "this is a real match" flag, so we independently re-derive matches by
// rendering the query's own filter clauses as standalone flat WIQL and executing them.
//
// Fail-closed: any clause bucket we can't safely render/execute returns null for that
// bucket rather than guessing. A wrong "match" highlight is worse than none.

export interface WorkItemFieldReference {
  name: string;
  referenceName: string;
}

export interface WorkItemQueryClause {
  clauses: WorkItemQueryClause[];
  field: WorkItemFieldReference | null;
  fieldValue: WorkItemFieldReference | null;
  isFieldValue: boolean;
  logicalOperator: string | null;
  operator: WorkItemFieldReference | null;
  value: string | null;
}

export interface QueryDefinition {
  queryType: string; // 'flat' | 'tree' | 'oneHop'
  isInvalidSyntax?: boolean;
  // LinkQueryMode — ADO REST may serialize this as a camelCase name (e.g.
  // 'linksOneHopDoesNotContain') or a raw numeric enum value depending on version;
  // handled defensively via containsDoesNotContainMode() below rather than assumed shape.
  filterOptions?: string | number;
  clauses?: WorkItemQueryClause | null; // flat query
  sourceClauses?: WorkItemQueryClause | null; // tree/oneHop top-level filter
  targetClauses?: WorkItemQueryClause | null; // tree/oneHop child/link-target filter
  wiql?: string; // compiled WIQL text of the query — diagnostic only
}

// Maps ADO's structured-clause operator reference names (e.g. "SupportedOperations.Equals")
// to their literal WIQL syntax token. Empirically confirmed against a real ADO Server
// response: operators come back as these semantic reference names, NOT literal symbols.
// Anything not in this map bails (fail-closed) — a wrong mapping would only ever produce
// invalid WIQL (caught as a request error → null), never a silently-wrong match set.
const OPERATOR_TO_WIQL: Record<string, string> = {
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
const LIST_OPERATORS = new Set(['In', 'Not In', 'In Group', 'Not In Group']);

// LinkQueryMode.LinksOneHopDoesNotContain = 3, LinksRecursiveDoesNotContain = 6
const DOES_NOT_CONTAIN_NUMERIC_VALUES = new Set([3, 6]);

function isDoesNotContainMode(filterOptions: string | number | undefined): boolean {
  if (filterOptions === undefined) return false;
  if (typeof filterOptions === 'number') return DOES_NOT_CONTAIN_NUMERIC_VALUES.has(filterOptions);
  return filterOptions.toLowerCase().includes('doesnotcontain');
}

function escapeWiqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function isUnresolvableMacro(value: string): boolean {
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
        // Defensive against casing variance across ADO REST versions ('OR' vs 'Or').
        const op = String(child.logicalOperator ?? '').toUpperCase() === 'OR' ? 'OR' : 'AND';
        rendered.push(`${op} ${piece}`);
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
 * Renders one clause bucket (sourceClauses or targetClauses) into a flat WIQL query
 * and executes it. Returns the matching ids, or null if the bucket is absent, fails
 * to render, or the request errors.
 */
export async function executeClauseBucketAsFlatQuery(
  client: AdoClient,
  orgUrl: string,
  project: string,
  clauseTree: WorkItemQueryClause | null | undefined
): Promise<number[] | null> {
  if (!clauseTree) return null;

  const rendered = renderClauseTree(clauseTree);
  if (rendered === null) {
    logger.debug('queryMatchDerivation: clause bucket unrenderable', {
      field: clauseTree.field?.referenceName,
      operator: clauseTree.operator?.referenceName,
      isFieldValue: clauseTree.isFieldValue,
      hasChildren: (clauseTree.clauses?.length ?? 0) > 0,
      childOperators: (clauseTree.clauses ?? []).map(c => c.operator?.referenceName),
    });
    return null;
  }

  const normalizedUrl = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  const url = `${normalizedUrl}${encodeURIComponent(project)}/_apis/wit/wiql`;
  const wiqlQuery = { query: `SELECT [System.Id] FROM WorkItems WHERE ${rendered}` };

  try {
    const result = await client.post<{ workItems?: Array<{ id: number }> }>(url, wiqlQuery);
    const ids = (result.workItems ?? []).map(wi => wi.id).filter(Number.isInteger);
    logger.debug('queryMatchDerivation: clause bucket executed', { rendered, matchCount: ids.length });
    return ids;
  } catch (err) {
    logger.debug('queryMatchDerivation: clause-bucket WIQL execution failed', { rendered, err });
    return null;
  }
}

/**
 * Derives the true filter-match ids for a saved query, independent of the tree/oneHop
 * ancestor-and-sibling scaffolding ADO includes in the displayed hierarchy. Both the
 * top-level (sourceClauses) and child/link-target (targetClauses) filters — if present —
 * are rendered and executed independently; the result is their union. Returns null when
 * neither bucket can be determined (nothing to render, or query mode inverts semantics).
 */
export async function deriveMatchedIds(
  client: AdoClient,
  orgUrl: string,
  project: string,
  queryDef: QueryDefinition,
  presentIds: ReadonlySet<number>
): Promise<number[] | null> {
  if (queryDef.isInvalidSyntax) return null;

  // DoesNotContain modes invert match semantics (source matches ONLY WHEN no linked
  // item satisfies the target clause) — a plain union of the two clause buckets would
  // be actively wrong here, not just incomplete. Bail entirely rather than mislabel.
  if (isDoesNotContainMode(queryDef.filterOptions)) {
    return null;
  }

  const [sourceIds, targetIds] = await Promise.all([
    executeClauseBucketAsFlatQuery(client, orgUrl, project, queryDef.sourceClauses),
    executeClauseBucketAsFlatQuery(client, orgUrl, project, queryDef.targetClauses),
  ]);

  if (sourceIds === null && targetIds === null) return null;

  const union = new Set<number>([...(sourceIds ?? []), ...(targetIds ?? [])]);
  return [...union].filter(id => presentIds.has(id));
}
