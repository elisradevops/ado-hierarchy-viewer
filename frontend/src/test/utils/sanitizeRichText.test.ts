import { sanitizeRichHtml } from '../../utils/sanitizeRichText';

describe('sanitizeRichHtml', () => {
  it('keeps allowlisted structural tags', () => {
    const result = sanitizeRichHtml('<p>Para</p><ul><li>Item</li></ul><strong>Bold</strong>');
    expect(result).toContain('<p>Para</p>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item</li>');
    expect(result).toContain('<strong>Bold</strong>');
  });

  it('strips style/class/dir/color attributes from surviving tags', () => {
    const result = sanitizeRichHtml('<p dir="auto" style="margin-top:0;color:red" class="foo">Text</p>');
    expect(result).toBe('<p>Text</p>');
  });

  it('drops disallowed wrapper tags (span/div) but keeps their text content', () => {
    const result = sanitizeRichHtml('<div><span style="color:red">Wrapped text</span></div>');
    expect(result).not.toContain('<div>');
    expect(result).not.toContain('<span');
    expect(result).toContain('Wrapped text');
  });

  it('drops disallowed tags entirely, including their attributes (links, images)', () => {
    const result = sanitizeRichHtml('<a href="https://evil.example">Link text</a><img src="x.png">');
    expect(result).not.toContain('<a ');
    expect(result).not.toContain('<img');
    expect(result).toContain('Link text');
  });

  it('neutralizes a script injection payload — no script tag survives', () => {
    const result = sanitizeRichHtml('<p>Hi</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
  });

  it('neutralizes an event-handler-attribute injection attempt', () => {
    const result = sanitizeRichHtml('<p onclick="alert(1)">Click me</p>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('alert(1)');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichHtml('')).toBe('');
  });
});
