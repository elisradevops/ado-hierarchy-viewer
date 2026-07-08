/**
 * Detects and safely strips HTML-shaped string values ADO returns for rich-text fields
 * (System.Description, Microsoft.VSTS.TCM.ReproSteps, AcceptanceCriteria, etc.) — see
 * components/HtmlFieldCell.tsx, the consumer of stripHtmlToText.
 */

const HTML_TAG_RE = /<[a-z][\s\S]*>/i;
const BLOCK_CLOSE_RE = /<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi;

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

/**
 * Extracts plain text from an HTML string without ever rendering it into the live DOM —
 * DOMParser('text/html') only parses, it does not execute scripts or apply the document's
 * styles/handlers, so this is safe against injected markup.
 */
export function stripHtmlToText(html: string): string {
  // Preserve paragraph/line structure before tags are stripped — otherwise "Step 1</p><p>Step 2"
  // collapses into "Step 1Step 2" once textContent discards the tags.
  const withNewlines = html.replace(BLOCK_CLOSE_RE, '\n');
  const text = new DOMParser().parseFromString(withNewlines, 'text/html').body.textContent ?? '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
