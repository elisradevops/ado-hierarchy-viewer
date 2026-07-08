import DOMPurify from 'dompurify';

/**
 * Sanitizes ADO rich-text field HTML (Description, Repro Steps, Acceptance Criteria, etc.) down
 * to structure only — paragraphs, line breaks, lists, headings, bold/italic/underline. All
 * attributes (style, class, dir, color, font, ...) and every non-allowlisted tag (span, div, a,
 * img, table, script, ...) are stripped. DOMPurify keeps a stripped tag's child content by
 * default, so removing `span`/`div` wrappers still preserves their text.
 *
 * Only used for the expanded Dialog view (see HtmlFieldCell.tsx) — the collapsed grid cell keeps
 * the plain-text preview from stripHtmlToText (htmlFieldText.ts), unchanged.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'b', 'strong', 'i', 'em', 'u',
];

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
}
