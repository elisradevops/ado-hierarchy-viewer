export interface BffRequestHeaders {
  'Content-Type': string;
  'X-Ado-Org-Url': string;
  'X-Ado-PAT': string;
  [key: string]: string;
}

export function buildAuthHeaders(orgUrl: string, credential: string): BffRequestHeaders {
  return {
    'Content-Type': 'application/json',
    'X-Ado-Org-Url': orgUrl,
    'X-Ado-PAT': credential,
  };
}
