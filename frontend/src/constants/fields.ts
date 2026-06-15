export const BATCH_SIZE = 200;

export const DEFAULT_CLOSED_STATE = 'Closed';

export const DEFAULT_EFFORT_FIELD = 'Microsoft.VSTS.Scheduling.OriginalEstimate';

export const WI_FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.TeamProject',
] as const;

// Returns the full fields array including the effort field
export function buildWiFields(effortField: string): string[] {
  return [...WI_FIELDS, effortField];
}
