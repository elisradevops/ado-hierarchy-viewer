/**
 * Normalizes an Azure DevOps collection URI.
 * Ensures trailing slash. Handles both cloud and on-prem formats.
 * Examples:
 *   "https://dev.azure.com/myorg" → "https://dev.azure.com/myorg/"
 *   "https://tfs.company.com/tfs/DefaultCollection" → "https://tfs.company.com/tfs/DefaultCollection/"
 */
export function normalizeAdoOrgUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/**
 * Derives a display name from an ADO org/collection URL.
 */
export function deriveOrgName(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Builds the ADO work item URL for linking.
 */
export function buildWorkItemUrl(orgUrl: string, project: string, id: number): string {
  const base = normalizeAdoOrgUrl(orgUrl);
  return `${base}${encodeURIComponent(project)}/_workitems/edit/${id}`;
}
