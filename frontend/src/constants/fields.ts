export const BATCH_SIZE = 200;

export const DEFAULT_CLOSED_STATE = 'Closed';

export const DEFAULT_EFFORT_FIELD = 'Microsoft.VSTS.Scheduling.OriginalEstimate';

export const WI_BASE_FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.TeamProject',
  'System.AssignedTo',
  'System.AreaPath',
  'System.IterationPath',
  'System.Tags',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
] as const;

// All known fields to exclude from effort heuristic
export const KNOWN_FIELD_NAMES = new Set<string>([
  'System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.TeamProject',
  'System.AssignedTo', 'System.AreaPath', 'System.IterationPath', 'System.Tags',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
]);

// Returns the full fields array including the effort field (deduped)
export function buildWiFields(effortField: string): string[] {
  const fieldSet = new Set([...WI_BASE_FIELDS, effortField]);
  return [...fieldSet];
}

// Keep WI_FIELDS alias for any callers that use it
export const WI_FIELDS = WI_BASE_FIELDS;
