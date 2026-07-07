import type { FlatRow } from '../types/tree';
import { safeToFixed } from './numberGuards';

const TSV_HEADERS = ['ID', 'Type', 'Title', 'State', 'Progress %', 'Original Estimate', 'Remaining Work', 'Completed Work'];

export function flatRowsToTsv(rows: FlatRow[]): string {
  const lines: string[] = [TSV_HEADERS.join('\t')];
  for (const { node, depth } of rows) {
    const indent = '  '.repeat(depth);
    lines.push(
      [
        node.id,
        node.type,
        `${indent}${node.title}`,
        node.state,
        safeToFixed(node.progressPct, 1),
        node.originalEstimate,
        node.remainingWork,
        node.completedWork,
      ].join('\t')
    );
  }
  return lines.join('\n');
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older browsers
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}
