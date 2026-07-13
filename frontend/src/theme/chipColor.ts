import { darken } from '@mui/material/styles';

// Relative luminance (WCAG 2.1) — used to compute contrast ratio against a
// light chip background so chip text stays readable regardless of hue.
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// Parses hex (#rgb/#rrggbb) or MUI's darken()/lighten() output (rgb(r, g, b)) —
// both forms flow through here since readableChipTextColor re-parses its own
// darkened output on each loop iteration.
function parseToRgb(color: string): [number, number, number] {
  const rgbMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const int = parseInt(full.slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relativeLuminance(color: string): number {
  const [r, g, b] = parseToRgb(color).map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;
const MAX_DARKEN = 0.85;
const DARKEN_STEP = 0.1;

/**
 * A chip's accent color (e.g. Task's yellow #F2CB1D) reads fine as a tinted
 * background or a solid dot, but used directly as *text* on a light/white
 * background it can fail contrast badly — yellow and light-gray hues worst of
 * all. Darkens the color just enough to clear WCAG AA (4.5:1) against the
 * given background, leaving already-readable colors (purple, red, blue, teal)
 * untouched.
 */
export function readableChipTextColor(baseColor: string, background = '#ffffff'): string {
  let coeff = 0;
  let color = baseColor;
  while (contrastRatio(color, background) < WCAG_AA_NORMAL_TEXT && coeff < MAX_DARKEN) {
    coeff += DARKEN_STEP;
    color = darken(baseColor, coeff);
  }
  return color;
}
