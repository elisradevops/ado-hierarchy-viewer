import { COLUMN_DEFS, buildDynamicColumns, dynamicColKey, DYNAMIC_COL_PREFIX } from '../../constants/columns';

describe('COLUMN_DEFS order', () => {
  it('groups all effort/estimate columns contiguously', () => {
    const effortKeys = ['storyPoints', 'originalEstimate', 'remainingWork', 'completedWork'];
    const indices = effortKeys.map(k => COLUMN_DEFS.findIndex(c => c.key === k));
    expect(indices.every(i => i >= 0)).toBe(true);
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
    // contiguous: no gaps between min and max index
    expect(sorted[sorted.length - 1] - sorted[0]).toBe(effortKeys.length - 1);
  });

  it('marks Title/Type/State/Progress/Time as always-visible constants', () => {
    const always = COLUMN_DEFS.filter(c => c.always).map(c => c.key);
    expect(always).toEqual(['title', 'type', 'state', 'progressPct', 'time']);
  });

  it('places the computed Progress/Time columns after the effort group', () => {
    const completedWorkIdx = COLUMN_DEFS.findIndex(c => c.key === 'completedWork');
    const progressIdx = COLUMN_DEFS.findIndex(c => c.key === 'progressPct');
    const timeIdx = COLUMN_DEFS.findIndex(c => c.key === 'time');
    expect(progressIdx).toBeGreaterThan(completedWorkIdx);
    expect(timeIdx).toBeGreaterThan(progressIdx);
  });
});

describe('buildDynamicColumns', () => {
  it('builds one ColumnDef per query column not already covered by a fixed field', () => {
    const cols = buildDynamicColumns([
      { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
      { referenceName: 'System.AssignedTo', name: 'Assigned To' }, // already fixed — excluded
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ key: dynamicColKey('Custom.RiskLevel'), label: 'Risk Level', field: 'Custom.RiskLevel' });
  });

  it('excludes query columns matching any fixed ColumnDef field (e.g. StoryPoints)', () => {
    const cols = buildDynamicColumns([
      { referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints', name: 'Story Points' },
    ]);
    expect(cols).toHaveLength(0);
  });

  it('returns an empty array when the query declared no columns', () => {
    expect(buildDynamicColumns([])).toEqual([]);
  });

  it('prefixes dynamic keys so they are distinguishable from fixed columns', () => {
    const cols = buildDynamicColumns([{ referenceName: 'Custom.Foo', name: 'Foo' }]);
    expect(cols[0].key.startsWith(DYNAMIC_COL_PREFIX)).toBe(true);
  });

  it('excludes the configured effort field even when it is one of the query\'s own columns', () => {
    const cols = buildDynamicColumns(
      [
        { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
        { referenceName: 'Custom.Effort', name: 'Effort' },
      ],
      'Custom.Effort'
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].field).toBe('Custom.RiskLevel');
  });

  it('behaves unchanged when effortField is omitted', () => {
    const cols = buildDynamicColumns([{ referenceName: 'Custom.RiskLevel', name: 'Risk Level' }]);
    expect(cols).toHaveLength(1);
  });

  it('excludes System.Id/WorkItemType/Title/State even though those ColumnDefs have no `field`', () => {
    // These are the columns nearly every baseline query SELECTs — Title/Type/State are
    // already shown via their own always-visible columns and Id inline in the Title cell,
    // so if the query declares them as its own columns they must not leak through as
    // duplicate, always-empty dynamic columns.
    const cols = buildDynamicColumns([
      { referenceName: 'System.Id', name: 'ID' },
      { referenceName: 'System.WorkItemType', name: 'Work Item Type' },
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'System.State', name: 'State' },
      { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].field).toBe('Custom.RiskLevel');
  });
});
