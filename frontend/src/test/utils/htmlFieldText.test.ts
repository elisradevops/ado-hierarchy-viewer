import { looksLikeHtml, stripHtmlToText } from '../../utils/htmlFieldText';

describe('looksLikeHtml', () => {
  it('detects HTML-tagged strings', () => {
    expect(looksLikeHtml('<p dir="auto" style="margin-top:0">Hello</p>')).toBe(true);
    expect(looksLikeHtml('<div>text</div>')).toBe(true);
  });

  it('does not flag plain text', () => {
    expect(looksLikeHtml('High')).toBe(false);
    expect(looksLikeHtml('Fixes login timeout after 30s idle')).toBe(false);
  });

  it('does not flag strings with < that are not tags', () => {
    expect(looksLikeHtml('3 < 5')).toBe(false);
  });
});

describe('stripHtmlToText', () => {
  it('extracts plain text from a simple paragraph', () => {
    expect(stripHtmlToText('<p dir="auto" style="margin-top:0">Hello world</p>')).toBe('Hello world');
  });

  it('preserves paragraph breaks as newlines', () => {
    const result = stripHtmlToText('<p>First</p><p>Second</p>');
    expect(result).toBe('First\nSecond');
  });

  it('converts <br> into a line break', () => {
    const result = stripHtmlToText('Line one<br>Line two');
    expect(result).toBe('Line one\nLine two');
  });

  it('preserves list item breaks', () => {
    const result = stripHtmlToText('<ul><li>One</li><li>Two</li></ul>');
    expect(result).toContain('One');
    expect(result).toContain('Two');
  });

  it('decodes HTML entities', () => {
    expect(stripHtmlToText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
  });

  it('collapses excessive blank lines', () => {
    const result = stripHtmlToText('<p>A</p><p></p><p></p><p>B</p>');
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('returns an empty string for empty input', () => {
    expect(stripHtmlToText('')).toBe('');
  });
});
