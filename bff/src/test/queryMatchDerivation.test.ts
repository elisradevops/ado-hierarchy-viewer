import {
  renderClauseTree,
  executeClauseBucketAsFlatQuery,
  deriveMatchedIds,
  type WorkItemQueryClause,
} from '../services/queryMatchDerivation';
import { AdoClient } from '../services/AdoClient';

jest.mock('../services/AdoClient');

const MockedAdoClient = AdoClient as jest.MockedClass<typeof AdoClient>;

function makeClient(): AdoClient {
  return new MockedAdoClient('dummy-token');
}

function field(referenceName: string, name = referenceName): { name: string; referenceName: string } {
  return { name, referenceName };
}

// Operator refs come back from ADO as semantic reference names, not literal WIQL
// symbols — confirmed empirically against a real ADO Server response.
const OP = {
  EQ: 'SupportedOperations.Equals',
  NEQ: 'SupportedOperations.NotEquals',
  IN: 'SupportedOperations.In',
  UNKNOWN: 'SupportedOperations.EverChangedTo', // deliberately unmapped
} as const;

function leaf(
  fieldRef: string,
  operatorRef: string,
  value: string,
  opts: Partial<WorkItemQueryClause> = {}
): WorkItemQueryClause {
  return {
    clauses: [],
    field: field(fieldRef),
    fieldValue: null,
    isFieldValue: false,
    logicalOperator: 'AND',
    operator: field(operatorRef, operatorRef),
    value,
    ...opts,
  };
}

function group(logicalOperator: string, children: WorkItemQueryClause[]): WorkItemQueryClause {
  return {
    clauses: children.map((c, i) => (i === 0 ? c : { ...c, logicalOperator })),
    field: null,
    fieldValue: null,
    isFieldValue: false,
    logicalOperator: 'AND',
    operator: null,
    value: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── renderClauseTree ───────────────────────────────────────────────────────

describe('renderClauseTree', () => {
  it('renders a single leaf clause', () => {
    const clause = leaf('System.State', OP.EQ, 'Closed');
    expect(renderClauseTree(clause)).toBe("[System.State] = 'Closed'");
  });

  it('escapes single quotes in the value', () => {
    const clause = leaf('System.Title', OP.EQ, "O'Brien's task");
    expect(renderClauseTree(clause)).toBe("[System.Title] = 'O''Brien''s task'");
  });

  it('renders AND-joined group of clauses', () => {
    const clause = group('AND', [
      leaf('System.WorkItemType', OP.EQ, 'Task'),
      leaf('System.State', OP.EQ, 'Closed'),
    ]);
    expect(renderClauseTree(clause)).toBe("([System.WorkItemType] = 'Task' AND [System.State] = 'Closed')");
  });

  it('renders OR-joined group of clauses', () => {
    const clause = group('OR', [
      leaf('System.State', OP.EQ, 'Closed'),
      leaf('System.State', OP.EQ, 'Removed'),
    ]);
    expect(renderClauseTree(clause)).toBe("([System.State] = 'Closed' OR [System.State] = 'Removed')");
  });

  it('handles nested groups', () => {
    const inner = group('OR', [
      leaf('System.State', OP.EQ, 'Closed'),
      leaf('System.State', OP.EQ, 'Removed'),
    ]);
    const outer = group('AND', [leaf('System.WorkItemType', OP.EQ, 'Task'), inner]);
    expect(renderClauseTree(outer)).toBe(
      "([System.WorkItemType] = 'Task' AND ([System.State] = 'Closed' OR [System.State] = 'Removed'))"
    );
  });

  it('preserves macro tokens unquoted (e.g. @project)', () => {
    const clause = leaf('System.TeamProject', OP.EQ, '@project');
    expect(renderClauseTree(clause)).toBe('[System.TeamProject] = @project');
  });

  it('bails on @CurrentIteration macro (unresolvable team context)', () => {
    const clause = leaf('System.IterationPath', OP.EQ, '@CurrentIteration');
    expect(renderClauseTree(clause)).toBeNull();
  });

  it('bails on @currentIterations (plural) macro too', () => {
    const clause = leaf('System.IterationPath', OP.IN, '@CurrentIterations');
    expect(renderClauseTree(clause)).toBeNull();
  });

  it('renders field-to-field comparisons via fieldValue', () => {
    const clause: WorkItemQueryClause = {
      clauses: [],
      field: field('System.ChangedBy'),
      fieldValue: field('System.CreatedBy'),
      isFieldValue: true,
      logicalOperator: 'AND',
      operator: field(OP.EQ, OP.EQ),
      value: null,
    };
    expect(renderClauseTree(clause)).toBe('[System.ChangedBy] = [System.CreatedBy]');
  });

  it('renders In operator as a quoted, comma-separated WIQL list', () => {
    const clause = leaf('System.State', OP.IN, 'Active,Resolved');
    expect(renderClauseTree(clause)).toBe("[System.State] In ('Active','Resolved')");
  });

  it('bails on unknown/unmapped operator', () => {
    const clause = leaf('System.State', OP.UNKNOWN, 'x');
    expect(renderClauseTree(clause)).toBeNull();
  });

  it('bails when a nested child is unrenderable', () => {
    const clause = group('AND', [
      leaf('System.WorkItemType', OP.EQ, 'Task'),
      leaf('System.State', OP.UNKNOWN, 'x'),
    ]);
    expect(renderClauseTree(clause)).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(renderClauseTree(null)).toBeNull();
    expect(renderClauseTree(undefined)).toBeNull();
  });

  it('bails when field or operator reference is missing', () => {
    const clause = leaf('', OP.EQ, 'x');
    expect(renderClauseTree({ ...clause, field: null })).toBeNull();
    expect(renderClauseTree({ ...clause, operator: null })).toBeNull();
  });
});

// ─── executeClauseBucketAsFlatQuery ─────────────────────────────────────────

describe('executeClauseBucketAsFlatQuery', () => {
  it('returns null when clauseTree is absent', async () => {
    const client = makeClient();
    const result = await executeClauseBucketAsFlatQuery(client, 'https://ado.example.com', 'Proj', null);
    expect(result).toBeNull();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('returns null when the clause tree is unrenderable', async () => {
    const client = makeClient();
    const clause = leaf('System.State', OP.UNKNOWN, 'x');
    const result = await executeClauseBucketAsFlatQuery(client, 'https://ado.example.com', 'Proj', clause);
    expect(result).toBeNull();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('executes the rendered flat WIQL and returns matched ids', async () => {
    const client = makeClient();
    const clause = leaf('System.State', OP.EQ, 'Closed');
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 1 }, { id: 2 }] });

    const result = await executeClauseBucketAsFlatQuery(client, 'https://ado.example.com', 'Proj', clause);

    expect(result).toEqual([1, 2]);
    const [calledUrl, calledBody] = (client.post as jest.Mock).mock.calls[0];
    expect(calledUrl).toContain('/Proj/_apis/wit/wiql');
    expect(calledBody.query).toBe("SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Closed'");
  });

  it('returns null when the WIQL request throws', async () => {
    const client = makeClient();
    const clause = leaf('System.State', OP.EQ, 'Closed');
    (client.post as jest.Mock).mockRejectedValueOnce(new Error('ADO unavailable'));

    const result = await executeClauseBucketAsFlatQuery(client, 'https://ado.example.com', 'Proj', clause);

    expect(result).toBeNull();
  });

  it('filters out non-integer ids from the response', async () => {
    const client = makeClient();
    const clause = leaf('System.State', OP.EQ, 'Closed');
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 1 }, { id: 1.5 }] });

    const result = await executeClauseBucketAsFlatQuery(client, 'https://ado.example.com', 'Proj', clause);

    expect(result).toEqual([1]);
  });
});

// ─── deriveMatchedIds ────────────────────────────────────────────────────────

describe('deriveMatchedIds', () => {
  const presentIds = new Set([1, 2, 3, 4, 5]);

  it('returns null when isInvalidSyntax is true', async () => {
    const client = makeClient();
    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'tree', isInvalidSyntax: true }, presentIds
    );
    expect(result).toBeNull();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('returns null for DoesNotContain filterOptions (string form)', async () => {
    const client = makeClient();
    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'oneHop', filterOptions: 'linksOneHopDoesNotContain', sourceClauses: leaf('System.State', OP.EQ, 'Closed') },
      presentIds
    );
    expect(result).toBeNull();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('returns null for DoesNotContain filterOptions (numeric form)', async () => {
    const client = makeClient();
    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'tree', filterOptions: 6, sourceClauses: leaf('System.State', OP.EQ, 'Closed') },
      presentIds
    );
    expect(result).toBeNull();
  });

  it('unions sourceClauses and targetClauses matches when both present', async () => {
    const client = makeClient();
    (client.post as jest.Mock)
      .mockResolvedValueOnce({ workItems: [{ id: 1 }, { id: 2 }] }) // source bucket
      .mockResolvedValueOnce({ workItems: [{ id: 3 }, { id: 4 }] }); // target bucket

    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      {
        queryType: 'tree',
        sourceClauses: leaf('System.WorkItemType', OP.EQ, 'Task'),
        targetClauses: leaf('System.State', OP.EQ, 'Active'),
      },
      presentIds
    );

    expect(result?.sort()).toEqual([1, 2, 3, 4]);
  });

  it('returns source-only matches when only sourceClauses is present', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 1 }] });

    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'tree', sourceClauses: leaf('System.WorkItemType', OP.EQ, 'Task') },
      presentIds
    );

    expect(result).toEqual([1]);
  });

  it('still returns the other bucket when one bucket bails', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 2 }] }); // only targetClauses executes

    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      {
        queryType: 'tree',
        sourceClauses: leaf('System.State', OP.UNKNOWN, 'x'), // unrenderable — bails
        targetClauses: leaf('System.State', OP.EQ, 'Active'),
      },
      presentIds
    );

    expect(result).toEqual([2]);
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('returns null when both buckets bail', async () => {
    const client = makeClient();
    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      {
        queryType: 'tree',
        sourceClauses: leaf('System.State', OP.UNKNOWN, 'x'),
        targetClauses: leaf('System.Tags', OP.UNKNOWN, 'y'),
      },
      presentIds
    );

    expect(result).toBeNull();
  });

  it('returns null when neither clause bucket is present', async () => {
    const client = makeClient();
    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'tree' },
      presentIds
    );
    expect(result).toBeNull();
  });

  it('intersects matched ids with presentIds', async () => {
    const client = makeClient();
    (client.post as jest.Mock).mockResolvedValueOnce({ workItems: [{ id: 1 }, { id: 999 }] });

    const result = await deriveMatchedIds(
      client, 'https://ado.example.com', 'Proj',
      { queryType: 'tree', sourceClauses: leaf('System.WorkItemType', OP.EQ, 'Task') },
      presentIds // does not contain 999
    );

    expect(result).toEqual([1]);
  });
});
