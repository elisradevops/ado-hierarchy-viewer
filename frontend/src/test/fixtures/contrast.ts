// Shared WCAG contrast-ratio math for tests asserting chip/progress text stays
// readable against its background — mirrors the production algorithm in
// theme/chipColor.ts (relativeLuminance/contrastRatio) but is kept as a separate,
// independent implementation on purpose: these tests exist to catch a regression
// in that production algorithm, so they must not import and re-trust it.

function toRgb(color: string): [number, number, number] {
  const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const int = parseInt(full.slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(color: string): number {
  const [r, g, b] = toRgb(color).map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(c1: string, c2: string): number {
  const l1 = luminance(c1), l2 = luminance(c2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
