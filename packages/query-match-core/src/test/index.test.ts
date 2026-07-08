import {
  renderClauseTree,
  OPERATOR_TO_WIQL,
  LIST_OPERATORS,
  isDoesNotContainMode,
  normalizeQueryType,
  unionAndFilterMatches,
  isUnresolvableMacro,
  escapeWiqlLiteral,
  extractQueryColumns,
  extractExtraFields,
  type WorkItemQueryClause,
} from '../index';

function leaf(overrides: Partial<WorkItemQueryClause> = {}): WorkItemQueryClause {
  return {
    clauses: [],
    field: { name: 'State', referenceName: 'System.State' },
    fieldValue: null,
    isFieldValue: false,
    logicalOperator: null,
    operator: { name: 'Equals', referenceName: 'SupportedOperations.Equals' },
    value: 'Active',
    ...overrides,
  };
}

describe('renderClauseTree — runs the full OPERATOR_TO_WIQL table once (shared by both transports)', () => {
  for (const [operatorRef, wiqlToken] of Object.entries(OPERATOR_TO_WIQL)) {
    it(`maps ${operatorRef} -> ${wiqlToken}`, () => {
      const isList = LIST_OPERATORS.has(wiqlToken);
      const clause = leaf({
        operator: { name: operatorRef, referenceName: operatorRef },
        value: isList ? 'A,B' : 'Active',
      });
      const rendered = renderClauseTree(clause);
      expect(rendered).not.toBeNull();
      expect(rendered).toContain(wiqlToken);
    });
  }

  it('unrecognized operator fails closed (null)', () => {
    const clause = leaf({ operator: { name: 'X', referenceName: 'SupportedOperations.NotARealOperator' } });
    expect(renderClauseTree(clause)).toBeNull();
  });

  it('renders a logical group joining children with AND/OR', () => {
    const group: WorkItemQueryClause = {
      clauses: [
        leaf({ value: 'Active' }),
        { ...leaf({ value: 'Closed' }), logicalOperator: 'Or' },
      ],
      field: null,
      fieldValue: null,
      isFieldValue: false,
      logicalOperator: null,
      operator: null,
      value: null,
    };
    expect(renderClauseTree(group)).toBe("([System.State] = 'Active' OR [System.State] = 'Closed')");
  });

  it('renders a logical group with the numeric LogicalOperation enum (extension SDK shape)', () => {
    const group: WorkItemQueryClause = {
      clauses: [
        leaf({ value: 'Active' }),
        { ...leaf({ value: 'Closed' }), logicalOperator: 2 }, // LogicalOperation.OR
      ],
      field: null,
      fieldValue: null,
      isFieldValue: false,
      logicalOperator: null,
      operator: null,
      value: null,
    };
    expect(renderClauseTree(group)).toBe("([System.State] = 'Active' OR [System.State] = 'Closed')");
  });

  it('numeric logicalOperator other than OR(2) defaults to AND', () => {
    const group: WorkItemQueryClause = {
      clauses: [
        leaf({ value: 'Active' }),
        { ...leaf({ value: 'Closed' }), logicalOperator: 1 }, // LogicalOperation.AND
      ],
      field: null,
      fieldValue: null,
      isFieldValue: false,
      logicalOperator: null,
      operator: null,
      value: null,
    };
    expect(renderClauseTree(group)).toBe("([System.State] = 'Active' AND [System.State] = 'Closed')");
  });

  it('fails closed on an unresolvable macro value', () => {
    expect(renderClauseTree(leaf({ value: '@CurrentIteration' }))).toBeNull();
    expect(isUnresolvableMacro('@CurrentIteration')).toBe(true);
    expect(isUnresolvableMacro('Active')).toBe(false);
  });

  it('escapes single quotes in literal values', () => {
    expect(escapeWiqlLiteral("O'Brien")).toBe("O''Brien");
  });

  it('null/undefined clause returns null', () => {
    expect(renderClauseTree(null)).toBeNull();
    expect(renderClauseTree(undefined)).toBeNull();
  });
});

describe('isDoesNotContainMode', () => {
  it('detects the numeric LinkQueryMode values (extension SDK shape)', () => {
    expect(isDoesNotContainMode(3)).toBe(true);
    expect(isDoesNotContainMode(6)).toBe(true);
    expect(isDoesNotContainMode(1)).toBe(false);
  });

  it('detects the string filterOptions shape (BFF raw REST shape), case-insensitively', () => {
    expect(isDoesNotContainMode('linksOneHopDoesNotContain')).toBe(true);
    expect(isDoesNotContainMode('LINKSRECURSIVEDOESNOTCONTAIN')).toBe(true);
    expect(isDoesNotContainMode('linksOneHopMustContain')).toBe(false);
  });

  it('undefined is not DoesNotContain mode', () => {
    expect(isDoesNotContainMode(undefined)).toBe(false);
  });
});

describe('normalizeQueryType — resolves the two transports\' differing shapes to one value', () => {
  it('numeric QueryType enum (extension SDK)', () => {
    expect(normalizeQueryType(1)).toBe('flat');
    expect(normalizeQueryType(2)).toBe('tree');
    expect(normalizeQueryType(3)).toBe('oneHop');
    expect(normalizeQueryType(99)).toBe('unknown');
  });

  it('lowercased string (BFF raw REST JSON)', () => {
    expect(normalizeQueryType('flat')).toBe('flat');
    expect(normalizeQueryType('Tree')).toBe('tree');
    expect(normalizeQueryType('onehop')).toBe('oneHop');
    expect(normalizeQueryType('OneHop')).toBe('oneHop');
  });

  it('undefined/null/unrecognized -> unknown', () => {
    expect(normalizeQueryType(undefined)).toBe('unknown');
    expect(normalizeQueryType(null)).toBe('unknown');
    expect(normalizeQueryType('bogus')).toBe('unknown');
  });
});

describe('unionAndFilterMatches', () => {
  it('unions source+target ids, filtered to present ids', () => {
    const present = new Set([1, 2, 3]);
    expect(unionAndFilterMatches([1, 2], [2, 3, 99], present)?.sort()).toEqual([1, 2, 3]);
  });

  it('both null -> null (fail-closed)', () => {
    expect(unionAndFilterMatches(null, null, new Set([1]))).toBeNull();
  });

  it('one bucket null -> union is just the other bucket', () => {
    expect(unionAndFilterMatches(null, [1, 2], new Set([1, 2]))).toEqual([1, 2]);
  });
});

describe('extractQueryColumns', () => {
  it('maps referenceName/name pairs through unchanged', () => {
    const result = extractQueryColumns([
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
    ]);
    expect(result).toEqual([
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
    ]);
  });

  it('filters out entries missing referenceName or name', () => {
    const result = extractQueryColumns([
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'Custom.Foo' }, // missing name
      { name: 'Bar' }, // missing referenceName
    ]);
    expect(result).toEqual([{ referenceName: 'System.Title', name: 'Title' }]);
  });

  it('returns an empty array for undefined or non-array input', () => {
    expect(extractQueryColumns(undefined)).toEqual([]);
  });
});

describe('extractExtraFields', () => {
  const isKnown = (f: string): boolean => f.startsWith('System.');

  it('collects requested fields outside the known set', () => {
    const result = extractExtraFields(
      ['System.Title', 'Custom.RiskLevel'],
      { 'System.Title': 'T1', 'Custom.RiskLevel': 'High' },
      isKnown
    );
    expect(result).toEqual({ 'Custom.RiskLevel': 'High' });
  });

  it('excludes the effort field even when it is outside the known set', () => {
    const result = extractExtraFields(
      ['System.Title', 'Custom.Effort'],
      { 'System.Title': 'T1', 'Custom.Effort': 5 },
      isKnown,
      'Custom.Effort'
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when nothing qualifies as extra', () => {
    const result = extractExtraFields(['System.Title'], { 'System.Title': 'T1' }, isKnown);
    expect(result).toBeUndefined();
  });

  it('skips fields absent from the raw fields object', () => {
    const result = extractExtraFields(['Custom.Missing'], {}, isKnown);
    expect(result).toBeUndefined();
  });
});
