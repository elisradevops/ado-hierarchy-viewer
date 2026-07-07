import type { FlatRow } from '../types/tree';
import { safeToFixed } from './numberGuards';

function escapeCsv(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = ['ID', 'Type', 'Title', 'State', 'Progress %', 'Original Estimate', 'Remaining Work', 'Completed Work'];

export function flatRowsToCsv(rows: FlatRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const { node, depth } of rows) {
    const indent = '  '.repeat(depth);
    lines.push(
      [
        escapeCsv(node.id),
        escapeCsv(node.type),
        escapeCsv(`${indent}${node.title}`),
        escapeCsv(node.state),
        escapeCsv(safeToFixed(node.progressPct, 1)),
        escapeCsv(node.originalEstimate),
        escapeCsv(node.remainingWork),
        escapeCsv(node.completedWork),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
