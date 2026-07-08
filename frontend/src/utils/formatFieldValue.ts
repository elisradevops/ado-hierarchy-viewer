/**
 * Formats a raw ADO field value (TreeNode.extraFields[refName]) for display in a
 * dynamic query column. Fixed columns (Story Points, Area Path, etc.) have their own
 * typed formatting already — this is only for columns the query itself declared that
 * aren't one of those (see constants/columns.ts buildDynamicColumns).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export function formatFieldValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
    }
    return value;
  }
  // Identity fields come back as { displayName, ... }
  if (typeof value === 'object' && 'displayName' in value) {
    return String((value as { displayName: unknown }).displayName ?? '—');
  }
  // Picklist multi-select fields come back as arrays — format each element the same way
  // (handles nested identity objects too) and join for display.
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatFieldValue).join(', ') : '—';
  }
  // Any other object shape has no known display convention — fall back to a dash rather
  // than the unhelpful literal "[object Object]" that String(value) would produce.
  if (typeof value === 'object') return '—';
  return String(value);
}
