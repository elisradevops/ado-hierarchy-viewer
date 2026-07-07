import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

/**
 * Parses a CSS color into [r, g, b], or null if the format isn't recognized. CSS custom
 * properties are returned by getComputedStyle as the raw literal text the host wrote
 * (unlike standard properties, they are never normalized to a canonical format), so this
 * accepts every format the ADO host could plausibly inject: 3/6/8-digit hex and rgb()/rgba().
 */
function parseColor(value: string): [number, number, number] | null {
  const trimmed = value.trim();

  const hex = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const int = parseInt(h.slice(0, 6), 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  return null;
}

// Relative luminance heuristic (ITU-R BT.601) on the host-injected background color —
// good enough to classify "clearly dark" vs "clearly light" without needing the full
// WCAG contrast formula.
export function isDarkBackground(value: string): boolean {
  const rgb = parseColor(value);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/**
 * Tracks the ADO extension host's light/dark theme. `SDK.init({ applyTheme: true })`
 * (see adoSdk.ts) injects the host's theme as CSS custom properties on `:root` — including
 * `--background-color` — and dispatches a `themeApplied` window event whenever the host's
 * theme changes. Outside the extension host (standalone mode) that event never fires, so
 * this always resolves to 'light', matching the app's previous hard-coded behavior there.
 */
export function useAdoTheme(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const resolveFromRoot = (): void => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim();
      if (bg) setMode(isDarkBackground(bg) ? 'dark' : 'light');
    };

    // Covers the case where SDK.init's applyTheme already ran before this hook mounted.
    resolveFromRoot();

    window.addEventListener('themeApplied', resolveFromRoot);
    return () => window.removeEventListener('themeApplied', resolveFromRoot);
  }, []);

  return mode;
}
