import {
  renderClauseTree,
  isDoesNotContainMode,
  unionAndFilterMatches,
  type WorkItemFieldReference,
  type WorkItemQueryClause,
} from '@ado-hierarchy-viewer/query-match-core';
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
//
// Clause rendering, operator mapping, and mode-check logic live in the shared
// @ado-hierarchy-viewer/query-match-core package — identical to the extension-mode
// twin in frontend/src/api/adoDirect.ts. Only this file's actual HTTP transport
// (AdoClient.post against the raw REST API) is BFF-specific.

export type { WorkItemFieldReference, WorkItemQueryClause };
export { renderClauseTree };

export interface QueryDefinition {
  queryType: string; // 'flat' | 'tree' | 'oneHop'
  isInvalidSyntax?: boolean;
  // LinkQueryMode — ADO REST may serialize this as a camelCase name (e.g.
  // 'linksOneHopDoesNotContain') or a raw numeric enum value depending on version;
  // handled defensively via isDoesNotContainMode() rather than assumed shape.
  filterOptions?: string | number;
  clauses?: WorkItemQueryClause | null; // flat query
  sourceClauses?: WorkItemQueryClause | null; // tree/oneHop top-level filter
  targetClauses?: WorkItemQueryClause | null; // tree/oneHop child/link-target filter
  wiql?: string; // compiled WIQL text of the query — diagnostic only
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

  // DoesNotContain modes invert match semantics — bail entirely rather than mislabel.
  if (isDoesNotContainMode(queryDef.filterOptions)) {
    return null;
  }

  const [sourceIds, targetIds] = await Promise.all([
    executeClauseBucketAsFlatQuery(client, orgUrl, project, queryDef.sourceClauses),
    executeClauseBucketAsFlatQuery(client, orgUrl, project, queryDef.targetClauses),
  ]);

  return unionAndFilterMatches(sourceIds, targetIds, presentIds);
}
